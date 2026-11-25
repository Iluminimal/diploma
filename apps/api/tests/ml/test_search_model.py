"""Жинхэнэ FashionCLIP model, dev database-ийн жинхэнэ каталог, жинхэнэ зургаар хайлтын чанарыг
end-to-end шалгана. `make test-ml`-ээр ажиллуулна (өмнө нь `make ingest` хийсэн байх ёстой).
"""

import io
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Literal

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from angel.core.config import Settings, get_settings
from angel.ingestion.cleaning import CleanProduct, load_catalog
from angel.main import create_app

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


async def _running(localizer: Literal["whole", "yolo"]) -> AsyncIterator[AsyncClient]:
    settings = Settings(
        app_env="test", log_level="WARNING", rate_limit_enabled=False, localizer=localizer
    )
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as connection:
        count = (await connection.execute(text("SELECT count(*) FROM products"))).scalar_one()
    await engine.dispose()
    if count < 1000:
        pytest.skip("the dev catalogue is not ingested (make ingest)")
    app = create_app(settings)
    async with LifespanManager(app, startup_timeout=120):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


@pytest.fixture
async def real_api() -> AsyncIterator[AsyncClient]:
    """Жинхэнэ FashionCLIP, detector-гүй (бүтэн зургаар хайна): embedding-ийн чанарыг шалгана."""
    async for client in _running("whole"):
        yield client


@pytest.fixture
async def yolo_api() -> AsyncIterator[AsyncClient]:
    """Жинхэнэ FashionCLIP ба YOLO: хувцсыг тайрч хайна."""
    async for client in _running("yolo"):
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
        # Dataset заримдаа нэг зургийг хоёр бараанд ашигладаг (жишээ нь цамцны зургийг цагонд),
        # тиймээс эхэнд тэнцэх нь хэвийн: барааг өөрийг нь хэн ч гүйцэхгүй байхад л болно.
        assert results[0]["similarity"] == pytest.approx(own["similarity"], abs=1e-3)


async def test_with_the_detector_most_catalogue_photos_still_find_themselves(
    yolo_api: AsyncClient, dataset_products: dict[str, list[CleanProduct]]
) -> None:
    """YOLO хувцсыг тайрдаг тул vector нь хадгалсан (бүтэн зургийн) embedding-тэй яг таарахгүй
    (~0.8-0.9). Бараг ижил бараа олонтой төрөлд (jegging) өөрөө эхний 5-аас гарч болох тул
    ихэнх нь л олдоно гэж шаардана."""
    products = [p for bucket in dataset_products.values() for p in bucket]
    found = 0
    for product in products:
        response = await yolo_api.post(
            f"{SEARCH}/image", files=photo(product.image_path), data={"limit": "5"}
        )

        body = response.json()
        assert body["regions"]  # хамгийн багадаа нэг хэсэг (detector юу ч олоогүй бол бүтэн зураг)
        found += any(
            h["product"]["slug"].endswith(f"-{product.source_id}") and h["similarity"] > 0.7
            for h in body["results"]
        )

    assert found / len(products) >= 0.7, f"{found}/{len(products)} found themselves"


async def test_a_photo_of_an_outfit_returns_each_garment_with_its_own_products(
    yolo_api: AsyncClient, dataset_products: dict[str, list[CleanProduct]]
) -> None:
    """Цамц, жинс, гутлыг зэрэгцүүлсэн зураг: хувцас бүр өөрийн төрлийн бараа авна."""
    shirt = dataset_products["Tshirts"][0]
    jeans = dataset_products["Jeans"][0]
    shoes = dataset_products["Casual Shoes"][0]
    canvas = Image.new("RGB", (900, 400), "white")
    for slot, product in enumerate((shirt, jeans, shoes)):
        photo = Image.open(product.image_path).convert("RGB").resize((300, 400))
        canvas.paste(photo, (300 * slot, 0))
    buffer = io.BytesIO()
    canvas.save(buffer, format="JPEG")

    response = await yolo_api.post(
        f"{SEARCH}/garments", files={"file": ("outfit.jpg", buffer.getvalue(), "image/jpeg")}
    )

    garments = response.json()["garments"]
    assert len(garments) >= 3

    def types_of(garment: dict[str, list[dict[str, dict[str, str]]]]) -> list[str]:
        return [hit["product"]["article_type"] for hit in garment["results"]]

    # Хамгийн багадаа нэг хэсэг бүр өөрийн төрлийн (цамц, өмд, гутал) бараа ихэвчлэн авсан байна.
    wanted = [
        {"Tshirts", "Shirts", "Tops"},
        {"Jeans", "Trousers", "Jeggings"},
        {"Casual Shoes", "Sports Shoes", "Flats"},
    ]
    matched = [
        any(sum(t in group for t in types_of(g)) >= len(g["results"]) // 2 for g in garments)
        for group in wanted
    ]
    assert all(matched), (matched, [types_of(g) for g in garments])


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
    assert tshirts >= 12  # дахиад цамц, зүгээр л улаавтар
