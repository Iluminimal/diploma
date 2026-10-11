from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import ColumnElement, UnaryExpression, func, literal_column, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer
from sqlalchemy.sql.base import ExecutableOption

from lookalike.models import Product
from lookalike.repositories.patterns import contains_pattern

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
    """Every field is optional; several values for one field mean "any of them"."""

    genders: tuple[str, ...] = ()
    master_categories: tuple[str, ...] = ()
    sub_categories: tuple[str, ...] = ()
    article_types: tuple[str, ...] = ()
    base_colours: tuple[str, ...] = ()
    seasons: tuple[str, ...] = ()
    usages: tuple[str, ...] = ()
    # Leaf categories a navigation node covers; resolved by the catalog service.
    category_ids: tuple[int, ...] = ()
    min_price_cents: int | None = None
    max_price_cents: int | None = None
    in_stock_only: bool = False

    def clauses(self) -> list[ColumnElement[bool]]:
        clauses: list[ColumnElement[bool]] = [Product.is_active.is_(True)]
        for column, values in (
            (Product.gender, self.genders),
            (Product.master_category, self.master_categories),
            (Product.sub_category, self.sub_categories),
            (Product.article_type, self.article_types),
            (Product.base_colour, self.base_colours),
            (Product.season, self.seasons),
            (Product.usage, self.usages),
            (Product.category_id, self.category_ids),
        ):
            if values:
                clauses.append(column.in_(values))
        if self.min_price_cents is not None:
            clauses.append(Product.price_cents >= self.min_price_cents)
        if self.max_price_cents is not None:
            clauses.append(Product.price_cents <= self.max_price_cents)
        if self.in_stock_only:
            clauses.append(Product.stock_quantity > 0)
        return clauses


ProductSort = Literal["newest", "price_asc", "price_desc", "relevance"]

# Rows are rendered as cards and JSON: the 2 KB vector and the tsvector are never needed, and
# loading them would roughly double the bytes read per hit.
_LIGHT_ROWS: tuple[ExecutableOption, ...] = (
    defer(Product.embedding),
    defer(Product.search_vector),
)


# Longer digit strings cannot be a bigint id.
MAX_ID_DIGITS = 18
AdminStatus = Literal["all", "active", "inactive"]
AdminSort = Literal["newest", "price_asc", "price_desc", "stock_asc"]


@dataclass(frozen=True)
class SimilarProduct:
    product: Product
    similarity: float  # cosine similarity, 1.0 = identical direction


class ProductRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, product_id: int) -> Product | None:
        result = await self._session.execute(
            select(Product)
            .where(Product.id == product_id, Product.is_active.is_(True))
            .options(*_LIGHT_ROWS)
        )
        return result.scalar_one_or_none()

    async def get_many(
        self, product_ids: Sequence[int], *, for_update: bool = False
    ) -> dict[int, Product]:
        """Products by id, inactive ones included (a cart line must still show a product that
        was withdrawn). `for_update` takes row locks in id order: every transaction that locks
        several products does so in the same order, so two checkouts cannot deadlock."""
        if not product_ids:
            return {}
        statement = (
            select(Product)
            .where(Product.id.in_(set(product_ids)))
            .options(*_LIGHT_ROWS)
            .order_by(Product.id)
        )
        if for_update:
            # populate_existing: the values read under the lock must replace anything this
            # session cached earlier, or the stock arithmetic would start from a stale number.
            statement = statement.with_for_update().execution_options(populate_existing=True)
        result = await self._session.execute(statement)
        return {product.id: product for product in result.scalars()}

    async def list_products(
        self,
        *,
        filters: SearchFilters,
        text_query: str | None,
        sort: ProductSort,
        offset: int,
        limit: int,
    ) -> tuple[list[Product], int]:
        """One page of the catalogue plus the total number of matches.

        Ordering always ends with `id`, so pages never overlap or skip rows when many products
        share a price or a rank.
        """
        clauses = filters.clauses()
        rank = None
        if text_query:
            # websearch_to_tsquery accepts raw user input (quotes, "or", "-word") without errors.
            query = func.websearch_to_tsquery(literal_column("'english'::regconfig"), text_query)
            clauses.append(Product.search_vector.op("@@")(query))
            rank = func.ts_rank(Product.search_vector, query)

        order: list[UnaryExpression[Any]]
        if sort == "price_asc":
            order = [Product.price_cents.asc(), Product.id.asc()]
        elif sort == "price_desc":
            order = [Product.price_cents.desc(), Product.id.asc()]
        elif sort == "relevance" and rank is not None:
            order = [rank.desc(), Product.id.asc()]
        else:
            order = [Product.created_at.desc(), Product.id.desc()]

        total = (
            await self._session.execute(select(func.count()).select_from(Product).where(*clauses))
        ).scalar_one()
        rows = await self._session.execute(
            select(Product)
            .where(*clauses)
            .order_by(*order)
            .offset(offset)
            .limit(limit)
            .options(*_LIGHT_ROWS)
        )
        return list(rows.scalars()), total

    async def sitemap_entries(
        self, *, offset: int, limit: int
    ) -> tuple[list[tuple[int, str, datetime]], int]:
        """(id, slug, updated_at) of active products in id order, plus how many there are."""
        total = (
            await self._session.execute(
                select(func.count()).select_from(Product).where(Product.is_active.is_(True))
            )
        ).scalar_one()
        rows = await self._session.execute(
            select(Product.id, Product.slug, Product.updated_at)
            .where(Product.is_active.is_(True))
            .order_by(Product.id)
            .offset(offset)
            .limit(limit)
        )
        return [(r.id, r.slug, r.updated_at) for r in rows.all()], int(total)

    # --- admin: everything below sees inactive products too ----------------------------------

    async def get_any(self, product_id: int, *, for_update: bool = False) -> Product | None:
        statement = select(Product).where(Product.id == product_id).options(*_LIGHT_ROWS)
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def list_all(
        self,
        *,
        text_query: str | None,
        status: AdminStatus,
        category_id: int | None,
        sort: AdminSort,
        offset: int,
        limit: int,
    ) -> tuple[list[Product], int]:
        """Admin listing. A plain substring match on the name (or the exact id), because an admin
        types half a word; the storefront's stemmed full-text search would miss it."""
        clauses: list[ColumnElement[bool]] = []
        if text_query:
            by_name = Product.name.ilike(contains_pattern(text_query), escape="\\")
            is_id = text_query.isdigit() and len(text_query) <= MAX_ID_DIGITS
            clauses.append(or_(by_name, Product.id == int(text_query)) if is_id else by_name)
        if status != "all":
            clauses.append(Product.is_active.is_(status == "active"))
        if category_id is not None:
            clauses.append(Product.category_id == category_id)
        orders: dict[AdminSort, list[UnaryExpression[Any]]] = {
            "newest": [Product.created_at.desc(), Product.id.desc()],
            "price_asc": [Product.price_cents.asc(), Product.id.asc()],
            "price_desc": [Product.price_cents.desc(), Product.id.asc()],
            "stock_asc": [Product.stock_quantity.asc(), Product.id.asc()],
        }
        order = orders[sort]
        total = (
            await self._session.execute(select(func.count()).select_from(Product).where(*clauses))
        ).scalar_one()
        rows = await self._session.execute(
            select(Product)
            .where(*clauses)
            .order_by(*order)
            .offset(offset)
            .limit(limit)
            .options(*_LIGHT_ROWS)
        )
        return list(rows.scalars()), total

    async def add(self, product: Product) -> Product:
        self._session.add(product)
        return await self.save(product)

    async def save(self, product: Product) -> Product:
        """Flush and reload the database-generated timestamps (expired by the write, and a lazy
        reload is impossible in async code)."""
        await self._session.flush()
        await self._session.refresh(product, ["created_at", "updated_at"])
        return product

    async def get_embedding(self, product_id: int) -> NDArray[np.float32] | None:
        result = await self._session.execute(
            select(Product.embedding).where(Product.id == product_id, Product.is_active.is_(True))
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
            .options(*_LIGHT_ROWS)
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
