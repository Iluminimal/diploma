"""End-to-end search quality with the real FashionCLIP model, the real catalogue in the dev
database and real photos. Run with `make test-ml` (needs `make ingest` to have been run)."""

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from lookalike.core.config import Settings, get_settings
from lookalike.ingestion.cleaning import CleanProduct, load_catalog
from lookalike.main import create_app

pytestmark = [pytest.mark.model, pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

SEARCH = "/api/v1/search"


@pytest.fixture(scope="module")
def dataset_products() -> dict[str, list[CleanProduct]]:
    dataset = get_settings().dataset_dir
    if dataset is None or not (dataset.expanduser() / "styles.csv").exists():
        pytest.skip("DATASET_DIR not set")
    dataset = dataset.expanduser()
    products, _ = load_catalog(dataset / "styles.csv", dataset / "images")
    wanted: dict[str, list[CleanProduct]] = {
        "Tshirts": [],
        "Casual Shoes": [],
        "Watches": [],
        "Dresses": [],
        "Jeans": [],
    }
    for product in products:
        bucket = wanted.get(product.article_type)
        if bucket is not None and len(bucket) < 6 and product.base_colour == "Blue":
            bucket.append(product)
    return wanted


@pytest.fixture
async def real_api() -> AsyncIterator[AsyncClient]:
    settings = Settings(app_env="test", log_level="WARNING", rate_limit_enabled=False)
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as connection:
        count = (await connection.execute(text("SELECT count(*) FROM products"))).scalar_one()
    await engine.dispose()
    if count < 1000:
        pytest.skip("the dev catalogue is not ingested (make ingest)")
    app = create_app(settings)
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


def photo(path: Path) -> dict[str, tuple[str, bytes, str]]:
    return {"file": (path.name, path.read_bytes(), "image/jpeg")}


async def test_readyz_is_green_with_the_real_model(real_api: AsyncClient) -> None:
    response = await real_api.get("/readyz")

    assert response.json()["checks"] == {"database": "ok", "redis": "ok", "model": "ok"}


async def test_the_detected_category_matches_what_the_photo_shows(
    real_api: AsyncClient, dataset_products: dict[str, list[CleanProduct]]
) -> None:
    for article_type in ("Tshirts", "Casual Shoes", "Watches", "Jeans"):
        hits = 0
        for product in dataset_products[article_type]:
            response = await real_api.post(f"{SEARCH}/image", files=photo(product.image_path))
            detected = [d["article_type"] for d in response.json()["detected"]]
            hits += article_type in detected
        assert hits >= len(dataset_products[article_type]) - 1, article_type


async def test_catalogue_photos_find_themselves(
    real_api: AsyncClient, dataset_products: dict[str, list[CleanProduct]]
) -> None:
    for product in [p for bucket in dataset_products.values() for p in bucket]:
        response = await real_api.post(
            f"{SEARCH}/image", files=photo(product.image_path), data={"limit": "5"}
        )

        results = response.json()["results"]
        own = next(h for h in results if h["product"]["slug"].endswith(f"-{product.source_id}"))
        assert own["similarity"] > 0.999
        # The dataset occasionally lists one photo twice (e.g. a t-shirt photo also used for a
        # watch), so ties at the top are legitimate: nothing may beat the product itself.
        assert results[0]["similarity"] == pytest.approx(own["similarity"], abs=1e-3)


async def test_text_search_understands_colour_and_garment(real_api: AsyncClient) -> None:
    response = await real_api.post(f"{SEARCH}/text", json={"query": "red dress", "limit": 10})

    results = [hit["product"] for hit in response.json()["results"]]
    dress_like = {"Dresses", "Tunics", "Nightdress", "Baby Dolls", "Kurtas", "Jumpsuit"}
    assert sum(r["article_type"] in dress_like for r in results) >= 8
    assert sum(r["base_colour"] == "Red" for r in results) >= 8


async def test_hybrid_moves_the_results_towards_the_described_colour(
    real_api: AsyncClient, dataset_products: dict[str, list[CleanProduct]]
) -> None:
    blue_tshirt = dataset_products["Tshirts"][0]
    plain = await real_api.post(f"{SEARCH}/image", files=photo(blue_tshirt.image_path))
    refined = await real_api.post(
        f"{SEARCH}/hybrid",
        files=photo(blue_tshirt.image_path),
        data={"query": "the same t-shirt in red", "limit": "24"},
    )

    def red_share(response_json: dict[str, list[dict[str, dict[str, str]]]]) -> float:
        colours = [hit["product"]["base_colour"] for hit in response_json["results"]]
        return sum(c == "Red" for c in colours) / len(colours)

    assert red_share(refined.json()) > red_share(plain.json()) + 0.2
    tshirts = sum(h["product"]["article_type"] == "Tshirts" for h in refined.json()["results"])
    assert tshirts >= 12  # still t-shirts, just redder
