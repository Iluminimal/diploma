"""Admin product management: list, create from a photo, edit, replace the photo, withdraw."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pytest
from httpx import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.repositories.catalog.products import ProductRepository
from tests.catalogue import make_jpeg
from tests.commerce import Shopper, register, set_role
from tests.conftest import Api, ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ADMIN = "/api/v1/admin"
PRODUCTS = f"{ADMIN}/products"
INVALID_CATEGORY = "urn:angel:problem:invalid-category"
INVALID_IMAGE = "urn:angel:problem:invalid-image"
NOT_FOUND = "urn:angel:problem:product-not-found"
MB = 1024 * 1024


@asynccontextmanager
async def admin_api(
    api_factory: ApiFactory, db_engine: AsyncEngine, media: Path, **settings: Any
) -> AsyncIterator[tuple[Api, Shopper]]:
    """A running API (thumbnails written under `media`, never the real data folder) and a signed-in
    administrator."""
    async with api_factory(media_dir=media, **settings) as api:
        admin = await register(api.client)
        await set_role(db_engine, admin.user_id, "admin")
        yield api, admin


def fields(category_id: int, **overrides: Any) -> dict[str, Any]:
    return {
        "name": "Linen camp shirt",
        "category_id": str(category_id),
        "gender": "Men",
        "base_colour": "Blue",
        "season": "Summer",
        "price_cents": "4999",
        "stock_quantity": "7",
        **overrides,
    }


async def category_id(api: Api, admin: Shopper, article_type: str = "Shirts") -> int:
    response = await api.client.get(f"{ADMIN}/categories", headers=admin.auth)
    assert response.status_code == 200, response.text
    return int(next(c["id"] for c in response.json() if c["article_type"] == article_type))


async def create(
    api: Api,
    admin: Shopper,
    seed: int = 900,
    *,
    category: int | None = None,
    form: dict[str, Any] | None = None,
) -> Response:
    category = category or await category_id(api, admin)
    return await api.client.post(
        PRODUCTS,
        data={**fields(category), **(form or {})},
        files={"file": ("shirt.jpg", make_jpeg(seed), "image/jpeg")},
        headers=admin.auth,
    )


async def search_ids(api: Api, jpeg: bytes) -> list[int]:
    response = await api.client.post(
        "/api/v1/search/image", files={"file": ("q.jpg", jpeg, "image/jpeg")}
    )
    assert response.status_code == 200, response.text
    return [hit["product"]["id"] for hit in response.json()["results"]]


def media_files(media: Path) -> list[Path]:
    return sorted((media / "products" / "admin").glob("*.webp")) if media.exists() else []


# --- who may use it ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/categories"),
        ("GET", "/products"),
        ("GET", "/products/1"),
        ("POST", "/products"),
        ("PATCH", "/products/1"),
        ("PUT", "/products/1/image"),
        ("POST", "/products/1/deactivate"),
        ("POST", "/products/1/activate"),
    ],
)
async def test_only_administrators_can_manage_products(
    api_factory: ApiFactory, tmp_path: Path, method: str, path: str
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        customer = await register(api.client)

        anonymous = await api.client.request(method, ADMIN + path)
        as_customer = await api.client.request(method, ADMIN + path, headers=customer.auth)

        assert anonymous.status_code == 401
        assert as_customer.status_code == 403
        assert as_customer.json()["type"] == "urn:angel:problem:forbidden"


async def test_admin_requests_are_rate_limited(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(
        api_factory, db_engine, tmp_path, seed_count=3, rate_limit_admin="2/60"
    ) as (api, admin):
        statuses = [
            (await api.client.get(PRODUCTS, headers=admin.auth)).status_code for _ in range(3)
        ]

    assert statuses == [200, 200, 429]


# --- reading -------------------------------------------------------------------------------


async def test_the_list_includes_withdrawn_products_and_filters_them(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=12) as (api, admin):
        await api.client.post(f"{PRODUCTS}/3/deactivate", headers=admin.auth)

        everything = (await api.client.get(PRODUCTS, headers=admin.auth)).json()
        inactive = (
            await api.client.get(PRODUCTS, params={"status": "inactive"}, headers=admin.auth)
        ).json()
        active = (
            await api.client.get(
                PRODUCTS, params={"status": "active", "page_size": 100}, headers=admin.auth
            )
        ).json()

        assert everything["total"] == 12
        assert [p["id"] for p in inactive["items"]] == [3]
        assert active["total"] == 11
        assert 3 not in [p["id"] for p in active["items"]]
        public = await api.client.get("/api/v1/products", params={"page_size": 60})
        assert 3 not in [p["id"] for p in public.json()["items"]]


async def test_the_list_paginates_sorts_and_searches(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=12) as (api, admin):
        first = (await api.client.get(PRODUCTS, params={"page_size": 5}, headers=admin.auth)).json()
        third = (
            await api.client.get(PRODUCTS, params={"page_size": 5, "page": 3}, headers=admin.auth)
        ).json()
        cheapest = (
            await api.client.get(
                PRODUCTS, params={"sort": "price_asc", "page_size": 100}, headers=admin.auth
            )
        ).json()
        target = cheapest["items"][4]
        by_id = (
            await api.client.get(PRODUCTS, params={"q": str(target["id"])}, headers=admin.auth)
        ).json()
        by_part = (
            await api.client.get(
                PRODUCTS, params={"q": target["name"][2:8].upper()}, headers=admin.auth
            )
        ).json()
        wildcard = (await api.client.get(PRODUCTS, params={"q": "%"}, headers=admin.auth)).json()
        huge = await api.client.get(PRODUCTS, params={"q": "9" * 40}, headers=admin.auth)

        assert (first["total"], first["pages"], len(first["items"])) == (12, 3, 5)
        assert len(third["items"]) == 2
        prices = [p["price_cents"] for p in cheapest["items"]]
        assert prices == sorted(prices)
        assert target["id"] in [p["id"] for p in by_id["items"]]
        assert target["id"] in [p["id"] for p in by_part["items"]]
        assert wildcard["total"] == 0  # a literal percent sign, not "match everything"
        assert huge.status_code == 200
        assert huge.json()["total"] == 0


async def test_one_product_can_be_read_and_a_missing_one_is_a_404(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=3) as (api, admin):
        found = await api.client.get(f"{PRODUCTS}/2", headers=admin.auth)
        missing = await api.client.get(f"{PRODUCTS}/999", headers=admin.auth)

        assert found.json()["id"] == 2
        assert found.json()["stock_quantity"] >= 0
        assert missing.status_code == 404
        assert missing.json()["type"] == NOT_FOUND


# --- creating from a photo -----------------------------------------------------------------


async def test_a_product_created_from_a_photo_is_found_by_visual_search(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=20) as (api, admin):
        photo = make_jpeg(900)

        response = await create(api, admin, 900)

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["name"] == "Linen camp shirt"
        assert body["slug"].startswith("linen-camp-shirt-")
        assert (body["master_category"], body["sub_category"], body["article_type"]) == (
            "Apparel",
            "Topwear",
            "Shirts",
        )
        assert body["price_cents"] == 4999
        assert body["currency"] == api.settings.currency
        assert body["stock_quantity"] == 7
        assert body["is_active"] is True
        assert body["source_id"] is None
        assert body["embedding_version"] == api.embedder.version
        # Searching with the very photo that was uploaded returns the new product first.
        assert (await search_ids(api, photo))[0] == body["id"]
        # And it is part of the storefront.
        detail = await api.client.get(f"/api/v1/products/{body['id']}")
        assert detail.status_code == 200
        assert detail.json()["in_stock"] is True
        assert len(media_files(tmp_path)) == 2  # 400 px and 800 px thumbnails
        assert body["image"]["thumb_800"].endswith("_800.webp")
        async with db_engine.connect() as connection:
            stored = (
                await connection.execute(
                    text("SELECT vector_dims(embedding) FROM products WHERE id = :id"),
                    {"id": body["id"]},
                )
            ).scalar_one()
        assert stored == 512


async def test_a_product_can_be_created_withdrawn(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        response = await create(api, admin, form={"is_active": "false"})

        assert response.status_code == 201
        assert response.json()["is_active"] is False
        assert (
            await api.client.get(f"/api/v1/products/{response.json()['id']}")
        ).status_code == 404
        assert response.json()["id"] not in await search_ids(api, make_jpeg(900))


@pytest.mark.parametrize(
    ("overrides", "problem_type"),
    [
        ({"category_id": "999999"}, INVALID_CATEGORY),
        ({"price_cents": "-1"}, None),
        ({"price_cents": "abc"}, None),
        ({"gender": "Robots"}, None),
        ({"name": " "}, None),
        ({"stock_quantity": "-3"}, None),
        ({"year": "1800"}, None),
    ],
)
async def test_invalid_details_are_rejected_and_nothing_is_stored(
    api_factory: ApiFactory,
    db_engine: AsyncEngine,
    tmp_path: Path,
    overrides: dict[str, str],
    problem_type: str | None,
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        response = await create(api, admin, form=overrides)

        assert response.status_code == 422, response.text
        if problem_type:
            assert response.json()["type"] == problem_type
        assert (await api.client.get(PRODUCTS, headers=admin.auth)).json()["total"] == 5
        assert media_files(tmp_path) == []


async def test_a_master_category_is_not_a_valid_category_for_a_product(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        async with db_engine.connect() as connection:
            master_id = (
                await connection.execute(text("SELECT id FROM categories WHERE level = 1 LIMIT 1"))
            ).scalar_one()

        response = await create(api, admin, category=master_id)

        assert response.status_code == 422
        assert response.json()["type"] == INVALID_CATEGORY


async def test_bad_uploads_are_rejected_before_anything_is_stored(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        category = await category_id(api, admin)
        form = fields(category)

        not_an_image = await api.client.post(
            PRODUCTS,
            data=form,
            files={"file": ("x.jpg", b"definitely not a jpeg", "image/jpeg")},
            headers=admin.auth,
        )
        wrong_type = await api.client.post(
            PRODUCTS,
            data=form,
            files={"file": ("x.txt", b"hello", "text/plain")},
            headers=admin.auth,
        )
        too_big = await api.client.post(
            PRODUCTS,
            data=form,
            files={"file": ("x.jpg", make_jpeg(1) + b"\0" * (9 * MB), "image/jpeg")},
            headers=admin.auth,
        )
        no_file = await api.client.post(PRODUCTS, data=form, headers=admin.auth)

        assert not_an_image.status_code == 422
        assert not_an_image.json()["type"] == INVALID_IMAGE
        assert wrong_type.status_code == 415
        assert too_big.status_code == 413
        assert no_file.status_code == 422
        assert (await api.client.get(PRODUCTS, headers=admin.auth)).json()["total"] == 5
        assert media_files(tmp_path) == []


async def test_files_are_removed_when_the_product_cannot_be_saved(
    api_factory: ApiFactory,
    db_engine: AsyncEngine,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing_add(self: ProductRepository, product: object) -> object:
        raise RuntimeError("database went away")

    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        category = await category_id(api, admin)
        monkeypatch.setattr(ProductRepository, "add", failing_add)

        with pytest.raises(RuntimeError):
            await create(api, admin, category=category)

        assert media_files(tmp_path) == []


# --- editing -------------------------------------------------------------------------------


async def test_editing_changes_only_the_fields_that_are_sent(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        created = (await create(api, admin)).json()

        response = await api.client.patch(
            f"{PRODUCTS}/{created['id']}",
            json={"price_cents": 2500, "base_colour": None, "stock_quantity": 0},
            headers=admin.auth,
        )

        body = response.json()
        assert response.status_code == 200, response.text
        assert body["price_cents"] == 2500
        assert body["base_colour"] is None
        assert body["stock_quantity"] == 0
        assert body["name"] == created["name"]
        assert body["season"] == "Summer"
        assert body["slug"] == created["slug"]  # URLs stay stable
        assert body["updated_at"] >= created["updated_at"]
        public = (await api.client.get(f"/api/v1/products/{created['id']}")).json()
        assert public["price_cents"] == 2500
        assert public["in_stock"] is False


async def test_changing_the_category_copies_its_names_onto_the_product(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=12) as (api, admin):
        created = (await create(api, admin)).json()
        jeans = await category_id(api, admin, "Jeans")

        response = await api.client.patch(
            f"{PRODUCTS}/{created['id']}", json={"category_id": jeans}, headers=admin.auth
        )

        body = response.json()
        assert (body["master_category"], body["sub_category"], body["article_type"]) == (
            "Apparel",
            "Bottomwear",
            "Jeans",
        )
        assert body["category_id"] == jeans


@pytest.mark.parametrize(
    "changes",
    [
        {"category_id": 999999},
        {"category_id": None},
        {"name": None},
        {"price_cents": None},
        {"price_cents": -5},
        {"gender": "Robots"},
        {"is_active": False},
        {"embedding_version": "x"},
    ],
)
async def test_invalid_edits_are_rejected_and_change_nothing(
    api_factory: ApiFactory,
    db_engine: AsyncEngine,
    tmp_path: Path,
    changes: dict[str, object],
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        created = (await create(api, admin)).json()

        response = await api.client.patch(
            f"{PRODUCTS}/{created['id']}", json=changes, headers=admin.auth
        )

        assert response.status_code == 422, response.text
        unchanged = (await api.client.get(f"{PRODUCTS}/{created['id']}", headers=admin.auth)).json()
        assert unchanged == created


async def test_editing_a_missing_product_is_a_404(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=3) as (api, admin):
        response = await api.client.patch(
            f"{PRODUCTS}/999", json={"price_cents": 1}, headers=admin.auth
        )

        assert response.status_code == 404
        assert response.json()["type"] == NOT_FOUND


# --- replacing the photo -------------------------------------------------------------------


async def test_replacing_the_photo_recomputes_the_embedding_and_removes_the_old_files(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=20) as (api, admin):
        created = (await create(api, admin, 900)).json()
        old_files = media_files(tmp_path)

        response = await api.client.put(
            f"{PRODUCTS}/{created['id']}/image",
            files={"file": ("new.jpg", make_jpeg(901), "image/jpeg")},
            headers=admin.auth,
        )

        body = response.json()
        assert response.status_code == 200, response.text
        assert body["image"]["thumb_800"] != created["image"]["thumb_800"]
        new_files = media_files(tmp_path)
        assert len(new_files) == 2
        assert not set(new_files) & set(old_files)
        assert (await search_ids(api, make_jpeg(901)))[0] == created["id"]
        assert (await search_ids(api, make_jpeg(900)))[0] != created["id"]


async def test_a_bad_replacement_photo_leaves_the_product_untouched(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        created = (await create(api, admin, 900)).json()

        response = await api.client.put(
            f"{PRODUCTS}/{created['id']}/image",
            files={"file": ("new.jpg", b"nope", "image/jpeg")},
            headers=admin.auth,
        )
        oversized = await api.client.put(
            f"{PRODUCTS}/{created['id']}/image",
            files={"file": ("big.jpg", make_jpeg(1) + b"\0" * (9 * MB), "image/jpeg")},
            headers=admin.auth,
        )
        missing = await api.client.put(
            f"{PRODUCTS}/999/image",
            files={"file": ("new.jpg", make_jpeg(2), "image/jpeg")},
            headers=admin.auth,
        )

        assert response.status_code == 422
        assert oversized.status_code == 413
        assert missing.status_code == 404
        assert (
            await api.client.get(f"{PRODUCTS}/{created['id']}", headers=admin.auth)
        ).json() == created
        assert len(media_files(tmp_path)) == 2
        assert (await search_ids(api, make_jpeg(900)))[0] == created["id"]


# --- withdrawing ---------------------------------------------------------------------------


async def test_a_withdrawn_product_disappears_everywhere_and_can_come_back(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=20) as (api, admin):
        created = (await create(api, admin, 900)).json()
        product_id = created["id"]
        listing = await api.client.get("/api/v1/products", params={"q": "linen"})
        assert [p["id"] for p in listing.json()["items"]] == [product_id]

        off = await api.client.post(f"{PRODUCTS}/{product_id}/deactivate", headers=admin.auth)

        assert off.status_code == 200
        assert off.json()["is_active"] is False
        assert (await api.client.get(f"/api/v1/products/{product_id}")).status_code == 404
        assert (await api.client.get(f"/api/v1/products/{product_id}/similar")).status_code == 404
        assert product_id not in await search_ids(api, make_jpeg(900))
        assert (await api.client.get("/api/v1/products", params={"q": "linen"})).json()[
            "items"
        ] == []
        assert (
            await api.client.get(f"{PRODUCTS}/{product_id}", headers=admin.auth)
        ).status_code == 200
        again = await api.client.post(f"{PRODUCTS}/{product_id}/deactivate", headers=admin.auth)
        assert again.status_code == 200  # withdrawing twice is harmless

        on = await api.client.post(f"{PRODUCTS}/{product_id}/activate", headers=admin.auth)

        assert on.json()["is_active"] is True
        assert (await search_ids(api, make_jpeg(900)))[0] == product_id


async def test_a_withdrawn_product_leaves_cached_similar_lists_at_once(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=20) as (api, admin):
        similar = "/api/v1/products/{}/similar"
        warm = (await api.client.get(similar.format(1))).json()
        neighbour = warm["results"][0]["product"]["id"]
        cached = (await api.client.get(similar.format(1))).json()
        assert cached["cached"] is True
        assert neighbour in [h["product"]["id"] for h in cached["results"]]

        await api.client.post(f"{PRODUCTS}/{neighbour}/deactivate", headers=admin.auth)

        after = (await api.client.get(similar.format(1))).json()
        assert neighbour not in [h["product"]["id"] for h in after["results"]]


async def test_a_product_withdrawn_here_can_no_longer_be_added_to_a_cart(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with admin_api(api_factory, db_engine, tmp_path, seed_count=5) as (api, admin):
        item = {"product_id": 2, "size": "M", "quantity": 1}
        before = await api.client.post("/api/v1/cart/items", json=item, headers=admin.auth)
        await api.client.post(f"{PRODUCTS}/2/deactivate", headers=admin.auth)

        after = await api.client.post("/api/v1/cart/items", json=item, headers=admin.auth)

        assert before.status_code == 200
        assert after.status_code == 404
        assert after.json()["type"] == NOT_FOUND
