"""Helpers shared by the recall and latency scripts."""

import random
from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from lookalike.models import Product
from lookalike.repositories.products import SearchFilters


async def sample_products(engine: AsyncEngine, n: int, seed: int) -> list[tuple[int, int]]:
    """Reproducible random sample of `(id, source_id)` from the catalogue."""
    async with engine.connect() as connection:
        rows = (
            await connection.execute(
                select(Product.id, Product.source_id).where(Product.source_id.is_not(None))
            )
        ).all()
    rng = random.Random(seed)  # noqa: S311 - sampling, not security
    pairs = [(i, s) for i, s in rows if s is not None]
    return rng.sample(pairs, min(n, len(pairs)))


async def exact_top_k(
    session: AsyncSession,
    embedding: NDArray[np.float32],
    k: int,
    filters: SearchFilters | None = None,
) -> list[int]:
    """Ground truth: a sequential scan with exact distances (no HNSW)."""
    await session.execute(text("SELECT set_config('enable_indexscan', 'off', true)"))
    distance = Product.embedding.cosine_distance(embedding)
    statement = (
        select(Product.id)
        .where(*(filters or SearchFilters()).clauses())
        .order_by(distance)
        .limit(k)
    )
    return [row[0] for row in (await session.execute(statement)).all()]


def percentiles(values_ms: Sequence[float]) -> dict[str, float]:
    array = np.asarray(values_ms, dtype=np.float64)
    return {
        "p50": float(np.percentile(array, 50)),
        "p95": float(np.percentile(array, 95)),
        "p99": float(np.percentile(array, 99)),
        "max": float(array.max()),
        "mean": float(array.mean()),
    }


def format_percentiles(label: str, values_ms: Sequence[float]) -> str:
    p = percentiles(values_ms)
    return (
        f"{label:<34} p50 {p['p50']:7.1f}  p95 {p['p95']:7.1f}  p99 {p['p99']:7.1f}  "
        f"max {p['max']:7.1f} ms  (n={len(values_ms)})"
    )
