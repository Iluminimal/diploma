from collections.abc import Sequence

import numpy as np
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from angel.ingestion.cleaning import CleanProduct
from angel.ingestion.pipeline import _upsert, build_row, ensure_categories
from angel.repositories.catalog.products import MAX_EF_SEARCH, ProductRepository, SearchFilters
from tests.ingestion.test_ingest_pipeline import _TYPES  # noqa: F401  (shared category fixtures)

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

VERSION = "test/pad"


def _unit(rows: int, seed: int) -> np.ndarray:
    vectors = np.random.default_rng(seed).standard_normal((rows, 512)).astype(np.float32)
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def _product(source_id: int, gender: str = "Men", article: str = "Shirts") -> CleanProduct:
    from pathlib import Path

    return CleanProduct(
        source_id=source_id,
        name=f"Item {source_id}",
        gender=gender,
        master_category="Apparel",
        sub_category="Topwear",
        article_type=article,
        base_colour="Blue",
        season="Summer",
        usage="Casual",
        year=2012,
        image_path=Path("unused.jpg"),
    )


async def load_catalogue(
    engine: AsyncEngine,
    products: Sequence[CleanProduct],
    vectors: np.ndarray,
) -> dict[int, int]:
    """Insert products with given vectors; return source_id -> product id."""
    async with engine.begin() as connection:
        category_ids = await ensure_categories(connection, products)
        rows = [
            build_row(
                p,
                category_id=category_ids[(p.master_category, p.sub_category, p.article_type)],
                blur_data_url=None,
                embedding=vector,
                version=VERSION,
                seed=1,
            )
            for p, vector in zip(products, vectors, strict=True)
        ]
        await _upsert(connection, rows)
        result = await connection.execute(text("SELECT source_id, id FROM products"))
        return dict(result.all())


@pytest.fixture
def sessions(db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(db_engine, expire_on_commit=False)


async def test_hnsw_cosine_index_exists_with_configured_parameters(db_engine: AsyncEngine) -> None:
    async with db_engine.connect() as connection:
        definition = (
            await connection.execute(
                text(
                    "SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_products_embedding_hnsw'"
                )
            )
        ).scalar_one()
    assert "USING hnsw" in definition
    assert "vector_cosine_ops" in definition
    assert "m='16'" in definition or "m=16" in definition
    assert "ef_construction" in definition


async def test_constraints_reject_bad_rows(db_engine: AsyncEngine) -> None:
    products = [_product(1), _product(2)]
    ids = await load_catalogue(db_engine, products, _unit(2, 0))
    assert len(ids) == 2

    async def attempt(statement: str) -> None:
        async with db_engine.begin() as connection:
            await connection.execute(text(statement))

    with pytest.raises(IntegrityError):
        await attempt("UPDATE products SET price_cents = -1 WHERE source_id = 1")
    with pytest.raises(IntegrityError):
        await attempt("UPDATE products SET stock_quantity = -5 WHERE source_id = 1")
    with pytest.raises(IntegrityError):
        await attempt("UPDATE products SET currency = 'US' WHERE source_id = 1")
    with pytest.raises(IntegrityError):
        await attempt(
            "UPDATE products SET slug = (SELECT slug FROM products WHERE source_id = 2) "
            "WHERE source_id = 1"
        )
    with pytest.raises(IntegrityError):
        await attempt("DELETE FROM categories")  # products still reference them


async def test_a_product_finds_itself_at_rank_one(
    db_engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    products = [_product(i) for i in range(60)]
    vectors = _unit(60, 1)
    ids = await load_catalogue(db_engine, products, vectors)

    async with sessions() as session, session.begin():
        repo = ProductRepository(session)
        for index in (0, 17, 59):
            hits = await repo.search_similar(vectors[index], limit=5)
            assert hits[0].product.id == ids[products[index].source_id]
            assert hits[0].similarity == pytest.approx(1.0, abs=1e-5)
            assert [h.similarity for h in hits] == sorted(
                (h.similarity for h in hits), reverse=True
            )


async def test_similar_products_exclude_the_product_itself(
    db_engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    products = [_product(i) for i in range(20)]
    vectors = _unit(20, 2)
    ids = await load_catalogue(db_engine, products, vectors)
    me = ids[products[3].source_id]

    async with sessions() as session, session.begin():
        repo = ProductRepository(session)
        stored = await repo.get_embedding(me)
        assert stored is not None
        np.testing.assert_allclose(stored, vectors[3], atol=1e-6)
        hits = await repo.search_similar(stored, limit=8, exclude_id=me)
        assert me not in {h.product.id for h in hits}
        assert len(hits) == 8
        assert await repo.get_embedding(999_999) is None


async def test_filters_are_applied(
    db_engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    products = [
        _product(i, gender="Men" if i % 2 else "Women", article="Shirts" if i % 3 else "Tops")
        for i in range(60)
    ]
    vectors = _unit(60, 3)
    await load_catalogue(db_engine, products, vectors)
    async with db_engine.begin() as connection:
        await connection.execute(
            text("UPDATE products SET stock_quantity = 0 WHERE source_id % 5 = 0")
        )
        await connection.execute(text("UPDATE products SET price_cents = 1000 + source_id * 100"))
        await connection.execute(text("UPDATE products SET is_active = false WHERE source_id = 7"))

    async with sessions() as session, session.begin():
        repo = ProductRepository(session)
        hits = await repo.search_similar(
            vectors[0],
            filters=SearchFilters(
                genders=("Men",),
                article_types=("Shirts",),
                in_stock_only=True,
                min_price_cents=2000,
                max_price_cents=5000,
            ),
            limit=60,
        )
        assert hits
        for hit in hits:
            p = hit.product
            assert (p.gender, p.article_type) == ("Men", "Shirts")
            assert p.stock_quantity > 0
            assert 2000 <= p.price_cents <= 5000
        everything = await repo.search_similar(vectors[0], limit=60)
        assert 7 not in {h.product.source_id for h in everything}  # inactive products never show


async def test_selective_filters_still_return_a_full_page_thanks_to_iterative_scan(
    db_engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """With a tiny ef_search and a filter matching ~5% of rows, plain HNSW returns almost
    nothing (the index yields 10 candidates, the filter discards them). Iterative scan keeps
    going until the page is full."""
    products = [_product(i) for i in range(1, 401)]
    vectors = _unit(400, 4)
    await load_catalogue(db_engine, products, vectors)
    async with db_engine.begin() as connection:
        # `stock_quantity` has no index, so the planner has to filter the HNSW scan's output.
        await connection.execute(
            text(
                "UPDATE products "
                "SET stock_quantity = CASE WHEN source_id % 20 = 0 THEN 5 ELSE 0 END"
            )
        )
    filters = SearchFilters(in_stock_only=True)

    async with sessions() as session, session.begin():
        await session.execute(text("SET LOCAL enable_seqscan = off"))  # force the HNSW index
        repo = ProductRepository(session)
        with_iterative = await repo.search_similar(
            vectors[5], filters=filters, limit=10, ef_search=10
        )
        without = await repo.search_similar(
            vectors[5], filters=filters, limit=10, ef_search=10, iterative_scan=False
        )

    assert len(with_iterative) == 10
    assert all(h.product.stock_quantity > 0 for h in with_iterative)
    assert len(without) < 10


async def test_query_settings_do_not_leak_between_transactions(
    db_engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await load_catalogue(db_engine, [_product(1)], _unit(1, 5))
    async with sessions() as session, session.begin():
        await ProductRepository(session).search_similar(_unit(1, 5)[0], ef_search=321)
    async with sessions() as session:
        value = (await session.execute(text("SHOW hnsw.ef_search"))).scalar_one()
    assert value == "40"  # pgvector's default, not 321


async def test_ef_search_is_clamped_below_the_sequential_scan_cliff(
    db_engine: AsyncEngine, sessions: async_sessionmaker[AsyncSession]
) -> None:
    await load_catalogue(db_engine, [_product(1)], _unit(1, 6))
    async with sessions() as session, session.begin():
        await ProductRepository(session).search_similar(_unit(1, 6)[0], ef_search=900)
        value = (await session.execute(text("SHOW hnsw.ef_search"))).scalar_one()
    assert value == str(MAX_EF_SEARCH)
