from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import ColumnElement, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.models import Product

# Measured on the full catalogue (docs/ml-pipeline.md): 200 gives recall@10 = 1.0 at the same
# latency as 80. Above ~300 the planner's cost estimate flips to an exact sequential scan
# (~90 ms instead of ~13 ms), so requests are clamped.
DEFAULT_EF_SEARCH = 200
MAX_EF_SEARCH = 300
# Upper bound on index tuples an iterative scan may visit before giving up (pgvector default
# is 20000). Keeps a very selective filter from turning into a full-index walk.
MAX_SCAN_TUPLES = 20_000


@dataclass(frozen=True)
class SearchFilters:
    gender: str | None = None
    category_id: int | None = None
    article_type: str | None = None
    base_colour: str | None = None
    min_price_cents: int | None = None
    max_price_cents: int | None = None
    in_stock_only: bool = False

    def clauses(self) -> list[ColumnElement[bool]]:
        clauses: list[ColumnElement[bool]] = [Product.is_active.is_(True)]
        if self.gender is not None:
            clauses.append(Product.gender == self.gender)
        if self.category_id is not None:
            clauses.append(Product.category_id == self.category_id)
        if self.article_type is not None:
            clauses.append(Product.article_type == self.article_type)
        if self.base_colour is not None:
            clauses.append(Product.base_colour == self.base_colour)
        if self.min_price_cents is not None:
            clauses.append(Product.price_cents >= self.min_price_cents)
        if self.max_price_cents is not None:
            clauses.append(Product.price_cents <= self.max_price_cents)
        if self.in_stock_only:
            clauses.append(Product.stock_quantity > 0)
        return clauses


@dataclass(frozen=True)
class SimilarProduct:
    product: Product
    similarity: float  # cosine similarity, 1.0 = identical direction


class ProductRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_embedding(self, product_id: int) -> NDArray[np.float32] | None:
        result = await self._session.execute(
            select(Product.embedding).where(Product.id == product_id)
        )
        value = result.scalar_one_or_none()
        return None if value is None else np.asarray(value, dtype=np.float32)

    async def search_similar(
        self,
        embedding: Sequence[float] | NDArray[np.float32],
        *,
        filters: SearchFilters | None = None,
        limit: int = 20,
        ef_search: int = DEFAULT_EF_SEARCH,
        exclude_id: int | None = None,
        iterative_scan: bool = True,
    ) -> list[SimilarProduct]:
        """Top-`limit` products by cosine similarity, using the HNSW index.

        Filtered HNSW search is the classic failure mode: the index returns `ef_search`
        candidates and the WHERE clause then discards most of them, leaving fewer than `limit`
        rows. pgvector >= 0.8 iterative scan keeps scanning the index until enough rows pass
        the filters, so no over-fetching is needed. `relaxed_order` is faster but may return
        rows slightly out of order, so results are re-sorted here (limit is small).
        """
        distance = Product.embedding.cosine_distance(embedding)
        statement = (
            select(Product, distance.label("distance"))
            .where(*(filters or SearchFilters()).clauses())
            .order_by(distance)
            .limit(limit)
        )
        if exclude_id is not None:
            statement = statement.where(Product.id != exclude_id)

        # set_config(..., is_local=true) is SET LOCAL with bind parameters: scoped to the
        # current transaction, so it never leaks to other users of the pooled connection.
        # One statement = one round trip.
        await self._session.execute(
            text(
                "SELECT set_config('hnsw.ef_search', :ef_search, true), "
                "set_config('hnsw.iterative_scan', :iterative_scan, true), "
                "set_config('hnsw.max_scan_tuples', :max_scan_tuples, true)"
            ),
            {
                "ef_search": str(min(max(ef_search, 1), MAX_EF_SEARCH)),
                "iterative_scan": "relaxed_order" if iterative_scan else "off",
                "max_scan_tuples": str(MAX_SCAN_TUPLES),
            },
        )
        rows = (await self._session.execute(statement)).all()
        hits = [SimilarProduct(product, 1.0 - float(dist)) for product, dist in rows]
        hits.sort(key=lambda hit: -hit.similarity)
        return hits
