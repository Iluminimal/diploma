"""Ingestion end to end against a real Postgres, with a deterministic fake embedder."""

from pathlib import Path

import numpy as np
import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.ingestion import embedding_store
from angel.ingestion.cleaning import CleanProduct
from angel.ingestion.images import THUMBNAIL_SIZES, image_key, thumbnail_key
from angel.ingestion.pipeline import (
    IngestOptions,
    export_embeddings,
    ingest_products,
)
from angel.ingestion.pricing import generate_price_and_stock
from angel.ml.fake import FakeEmbedder
from angel.models import Category, Product
from angel.storage import LocalStorage
from tests.support.fakes import write_jpeg

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

VERSION = FakeEmbedder.version
OPTIONS = IngestOptions(batch_size=4, workers=0, resize_mode="pad")

_TYPES = [
    ("Men", "Apparel", "Topwear", "Shirts"),
    ("Women", "Apparel", "Topwear", "Tops"),
    ("Men", "Footwear", "Shoes", "Casual Shoes"),
    ("Women", "Accessories", "Bags", "Handbags"),
]


def make_products(tmp_path: Path, count: int) -> list[CleanProduct]:
    products = []
    for index in range(count):
        source_id = 1000 + index * 7
        gender, master, sub, article = _TYPES[index % len(_TYPES)]
        path = tmp_path / "images" / f"{source_id}.jpg"
        write_jpeg(path, seed=source_id, size=(90, 120))
        products.append(
            CleanProduct(
                source_id=source_id,
                name=f"Brand {article} number {index}",
                gender=gender,
                master_category=master,
                sub_category=sub,
                article_type=article,
                base_colour="Blue" if index % 2 else None,
                season="Summer",
                usage="Casual",
                year=2012,
                image_path=path,
            )
        )
    return products


@pytest.fixture
def storage(tmp_path: Path) -> LocalStorage:
    return LocalStorage(tmp_path / "media", "http://test/media")


async def _count(engine: AsyncEngine) -> int:
    async with engine.connect() as connection:
        return (await connection.execute(select(func.count()).select_from(Product))).scalar_one()


async def test_ingest_writes_products_categories_thumbnails_and_embeddings(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 10)
    embedder = FakeEmbedder()

    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=embedder
    )

    assert (stats.upserted, stats.skipped, len(stats.failed)) == (10, 0, 0)
    assert stats.thumbnails_written == 10
    async with db_engine.connect() as connection:
        rows = (await connection.execute(select(Product).order_by(Product.source_id))).all()
        categories = (await connection.execute(select(Category))).all()
        search_hit = (
            await connection.execute(
                text(
                    "SELECT count(*) FROM products "
                    "WHERE search_vector @@ plainto_tsquery('english', 'handbags')"
                )
            )
        ).scalar_one()
    assert len(rows) == 10
    first = rows[0]
    assert first.embedding_version == VERSION
    assert len(first.embedding) == 512
    assert np.linalg.norm(first.embedding) == pytest.approx(1.0, abs=1e-5)
    assert (first.price_cents, first.stock_quantity) == generate_price_and_stock(
        first.source_id, article_type="Shirts", sub_category="Topwear", master_category="Apparel"
    )
    assert first.slug == f"brand-shirts-number-0-{first.source_id}"
    assert first.image_key == image_key(first.source_id)
    assert first.blur_data_url is not None
    assert first.is_active is True
    assert len({r.slug for r in rows}) == 10
    assert search_hit > 0
    # 3 masters (Apparel, Footwear, Accessories) + 3 subs (Shirts and Tops share Topwear)
    # + 4 article types.
    assert sorted(c.level for c in categories) == [1] * 3 + [2] * 3 + [3] * 4
    for product in products:
        for size in THUMBNAIL_SIZES:
            assert storage.exists(thumbnail_key(image_key(product.source_id), size))


async def test_rerun_is_a_no_op(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 8)
    first = FakeEmbedder()
    await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=first
    )

    second = FakeEmbedder()
    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=second
    )

    assert (stats.skipped, stats.upserted, stats.thumbnails_written) == (8, 0, 0)
    assert second.images_embedded == 0
    assert await _count(db_engine) == 8


async def test_interrupted_run_resumes_with_only_the_remaining_products(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 12)
    await ingest_products(
        db_engine, products[:5], storage, version=VERSION, options=OPTIONS, embedder=FakeEmbedder()
    )

    resumed = FakeEmbedder()
    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=resumed
    )

    assert stats.skipped == 5
    assert resumed.images_embedded == 7
    assert await _count(db_engine) == 12


async def test_a_crash_mid_run_keeps_completed_batches(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 12)

    class CrashingEmbedder(FakeEmbedder):
        def embed_arrays(self, arrays):  # type: ignore[no-untyped-def]
            if self.calls == 2:
                raise KeyboardInterrupt
            return super().embed_arrays(arrays)

    with pytest.raises(KeyboardInterrupt):
        await ingest_products(
            db_engine,
            products,
            storage,
            version=VERSION,
            options=OPTIONS,
            embedder=CrashingEmbedder(),
        )
    assert await _count(db_engine) == 8  # two batches of 4 were committed

    retry = FakeEmbedder()
    await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=retry
    )
    assert retry.images_embedded == 4
    assert await _count(db_engine) == 12


async def test_missing_thumbnail_is_regenerated_without_re_embedding(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 4)
    await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=FakeEmbedder()
    )
    victim = products[2].source_id
    (storage.root / thumbnail_key(image_key(victim), 800)).unlink()

    embedder = FakeEmbedder()
    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=embedder
    )

    assert stats.thumbnails_written == 1
    assert embedder.images_embedded == 0
    assert storage.exists(thumbnail_key(image_key(victim), 800))


async def test_reembed_replaces_embeddings_but_keeps_shop_owned_fields(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 3)
    await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=FakeEmbedder()
    )
    async with db_engine.begin() as connection:
        await connection.execute(
            update(Product).values(
                stock_quantity=999, is_active=False, price_cents=1234, embedding_version="old"
            )
        )

    embedder = FakeEmbedder()
    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=embedder
    )

    assert embedder.images_embedded == 3  # the stale version triggers re-embedding
    assert stats.thumbnails_written == 0
    async with db_engine.connect() as connection:
        rows = (await connection.execute(select(Product))).all()
    assert {r.embedding_version for r in rows} == {VERSION}
    assert {(r.stock_quantity, r.is_active, r.price_cents) for r in rows} == {(999, False, 1234)}


async def test_unreadable_images_are_reported_and_do_not_stop_the_run(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 6)
    products[3].image_path.write_bytes(b"\xff\xd8 corrupt")

    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, embedder=FakeEmbedder()
    )

    assert list(stats.failed) == [products[3].source_id]
    assert stats.upserted == 5
    assert await _count(db_engine) == 5


async def test_worker_processes_produce_the_same_result(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 9)
    options = IngestOptions(batch_size=4, workers=2, resize_mode="pad")

    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=options, embedder=FakeEmbedder()
    )

    assert (stats.upserted, len(stats.failed)) == (9, 0)
    assert await _count(db_engine) == 9


async def test_export_then_import_matches_direct_embedding(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 9)
    out = tmp_path / "embeddings"
    exported = export_embeddings(
        products,
        out,
        FakeEmbedder(),
        options=OPTIONS,
        dtype="float32",
        shard_size=4,
        storage=storage,
    )
    assert exported.upserted == 9
    assert len(list(out.glob("embeddings-*.parquet"))) >= 2  # sharded for resumability

    # Re-running the export only does the missing work.
    again = FakeEmbedder()
    resumed = export_embeddings(
        products, out, again, options=OPTIONS, dtype="float32", shard_size=4, storage=storage
    )
    assert (resumed.skipped, again.images_embedded) == (9, 0)

    imported = embedding_store.load_index(out, VERSION)
    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, imported=imported
    )
    assert stats.upserted == 9
    async with db_engine.connect() as connection:
        row = (
            await connection.execute(
                select(Product).where(Product.source_id == products[0].source_id)
            )
        ).one()
    np.testing.assert_allclose(row.embedding, imported[products[0].source_id], atol=1e-6)


async def test_import_reports_products_without_an_embedding(
    db_engine: AsyncEngine, storage: LocalStorage, tmp_path: Path
) -> None:
    products = make_products(tmp_path, 3)
    imported = {products[0].source_id: np.eye(512, dtype=np.float32)[0]}

    stats = await ingest_products(
        db_engine, products, storage, version=VERSION, options=OPTIONS, imported=imported
    )

    assert stats.upserted == 1
    assert set(stats.failed) == {products[1].source_id, products[2].source_id}


async def test_exactly_one_embedding_source_is_required(
    db_engine: AsyncEngine, storage: LocalStorage
) -> None:
    with pytest.raises(ValueError, match="exactly one"):
        await ingest_products(db_engine, [], storage, version=VERSION, options=OPTIONS)
