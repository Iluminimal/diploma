"""`GET /products/{id}/complete-the-look`: ижил хүйс, нэмэлт ангилал, зарагдаж буй бараа."""

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Api
from tests.support.commerce import set_product

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

PRODUCTS = "/api/v1/products"
# Seed: n % 4 -> Shirts, Tshirts (Topwear), Jeans (Bottomwear), Casual Shoes (Shoes).
TOPWEAR = ("Shirts", "Tshirts")


async def look(api: Api, product_id: int, **params: str | int) -> list[dict[str, object]]:
    response = await api.client.get(f"{PRODUCTS}/{product_id}/complete-the-look", params=params)
    assert response.status_code == 200, response.text
    items: list[dict[str, object]] = response.json()
    return items


async def test_a_top_is_completed_with_bottoms_and_shoes_not_with_more_tops(api: Api) -> None:
    top = next(e for e in api.entries if e.article_type == "Shirts" and e.gender == "Men")

    items = await look(api, top.product_id)

    kinds = {i["article_type"] for i in items}
    assert items
    assert kinds <= {"Jeans", "Casual Shoes"}
    assert top.product_id not in {i["id"] for i in items}


async def test_the_look_alternates_between_categories(api: Api) -> None:
    top = next(e for e in api.entries if e.article_type == "Shirts" and e.gender == "Men")

    items = await look(api, top.product_id)

    assert items[0]["article_type"] != items[1]["article_type"]


async def test_the_look_fits_the_gender_and_is_in_stock(api: Api) -> None:
    top = next(e for e in api.entries if e.article_type == "Shirts" and e.gender == "Women")
    allowed = {"Women", "Unisex"}

    items = await look(api, top.product_id, limit=12)

    assert items
    assert {i["gender"] for i in items} <= allowed
    assert all(i["in_stock"] for i in items)


async def test_at_most_two_come_from_one_category(api: Api) -> None:
    top = next(e for e in api.entries if e.article_type == "Shirts")

    items = await look(api, top.product_id, limit=12)

    per_kind: dict[object, int] = {}
    for item in items:
        per_kind[item["sub_category"]] = per_kind.get(item["sub_category"], 0) + 1
    assert max(per_kind.values()) <= 2


async def test_withdrawn_and_sold_out_products_are_left_out(
    api: Api, db_engine: AsyncEngine
) -> None:
    top = next(e for e in api.entries if e.article_type == "Shirts" and e.gender == "Men")
    before = await look(api, top.product_id, limit=12)
    gone = int(before[0]["id"])  # type: ignore[call-overload]
    await set_product(db_engine, gone, is_active=False)

    after = await look(api, top.product_id, limit=12)

    assert gone not in {i["id"] for i in after}


async def test_the_limit_is_honoured(api: Api) -> None:
    top = next(e for e in api.entries if e.article_type == "Shirts")

    assert len(await look(api, top.product_id, limit=3)) <= 3


async def test_an_unknown_or_withdrawn_product_is_a_404(api: Api, db_engine: AsyncEngine) -> None:
    unknown = await api.client.get(f"{PRODUCTS}/999999/complete-the-look")
    product = api.entries[0].product_id
    await set_product(db_engine, product, is_active=False)
    withdrawn = await api.client.get(f"{PRODUCTS}/{product}/complete-the-look")

    assert (unknown.status_code, withdrawn.status_code) == (404, 404)


@pytest.mark.parametrize("limit", [0, 13, "x"])
async def test_the_limit_is_bounded(api: Api, limit: str | int) -> None:
    response = await api.client.get(
        f"{PRODUCTS}/{api.entries[0].product_id}/complete-the-look", params={"limit": limit}
    )

    assert response.status_code == 422
