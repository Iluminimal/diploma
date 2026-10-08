"""The synthetic catalogue the end-to-end tests run on, and the fake-embedder switch."""

import io
from pathlib import Path

import pytest
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from lookalike.core.config import Settings
from lookalike.ingestion.synthetic import STOCK, garment_image, seed_catalogue
from lookalike.main import _load_embedder
from lookalike.ml.fake import FakeEmbedder
from lookalike.storage import LocalStorage
from tests.conftest import ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]


def test_garment_images_are_deterministic_and_all_different() -> None:
    first, again, other = garment_image(1), garment_image(1), garment_image(2)

    assert first.size == (600, 800)
    assert first.tobytes() == again.tobytes()
    assert first.tobytes() != other.tobytes()


async def test_seeding_is_repeatable_and_leaves_what_the_shop_changed_alone(
    db_engine: AsyncEngine, tmp_path: Path
) -> None:
    storage = LocalStorage(tmp_path, "/media")
    embedder = FakeEmbedder(version="fake@e2e")

    await seed_catalogue(db_engine, storage, embedder, 12)
    async with db_engine.begin() as connection:
        await connection.execute(text("UPDATE products SET is_active = false WHERE source_id = 3"))
    await seed_catalogue(db_engine, storage, embedder, 12)

    async with db_engine.connect() as connection:
        rows = (
            await connection.execute(
                text(
                    "SELECT source_id, is_active, stock_quantity, "
                    "blur_data_url IS NOT NULL FROM products"
                )
            )
        ).all()
    assert len(rows) == 12
    assert {r[0] for r in rows if not r[1]} == {3}
    assert all(r[3] for r in rows)
    sold_out = {r[0] for r in rows if r[2] == 0}
    assert sold_out == {10}
    assert {r[2] for r in rows if r[2] != 0} == {STOCK}
    assert (tmp_path / "products/000/1_400.webp").is_file()
    assert (tmp_path / "products/000/1_800.webp").is_file()


async def test_a_product_photo_found_in_media_finds_that_product_first(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    """The e2e visual-search test uploads a product's own thumbnail: it must rank first."""
    storage = LocalStorage(tmp_path, "/media")
    embedder = FakeEmbedder(version="fake@e2e")
    await seed_catalogue(db_engine, storage, embedder, 20)
    async with api_factory(seed_count=0, embedder=embedder, media_dir=tmp_path) as api:
        for source_id in (1, 7, 20):
            thumb = (tmp_path / f"products/000/{source_id}_800.webp").read_bytes()
            Image.open(io.BytesIO(thumb)).verify()

            response = await api.client.post(
                "/api/v1/search/image", files={"file": ("p.webp", thumb, "image/webp")}
            )

            hits = response.json()["results"]
            assert response.status_code == 200, response.text
            assert hits[0]["product"]["slug"].endswith(f"-{source_id}")
            assert hits[0]["similarity"] == pytest.approx(1.0, abs=1e-3)


async def test_the_fake_embedder_is_chosen_by_setting_and_refused_in_production(
    settings: Settings,
) -> None:
    chosen = await _load_embedder(settings.model_copy(update={"embedder": "fake"}))

    assert isinstance(chosen, FakeEmbedder)
    assert chosen.version == "fake@e2e"
    with pytest.raises(ValueError, match="EMBEDDER=fake"):
        Settings(
            app_env="prod",
            embedder="fake",
            jwt_secret="x" * 40,
            payments_mode="stripe",
            stripe_secret_key="sk_test_x",
            stripe_webhook_secret="whsec_x",
        )
