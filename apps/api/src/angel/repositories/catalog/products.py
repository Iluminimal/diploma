from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import (
    ColumnElement,
    Select,
    Subquery,
    UnaryExpression,
    case,
    func,
    literal,
    literal_column,
    or_,
    select,
    text,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer
from sqlalchemy.sql.base import ExecutableOption

from angel.models import Order, OrderItem, Product
from angel.repositories.patterns import contains_pattern

# Бүтэн catalogue дээр хэмжсэн (docs/ml-pipeline.md): 200 нь 80-тай ижил хугацаанд recall@10 = 1.0
# өгнө. ~300-аас дээш бол planner-ийн зардлын тооцоо exact sequential scan руу шилжинэ (~13 ms-ийн
# оронд ~90 ms), тиймээс хүсэлтийн утгыг хязгаарлана.
DEFAULT_EF_SEARCH = 200
MAX_EF_SEARCH = 300
# Iterative scan цаашаа явахаас өмнө үзэж болох index tuple-ийн дээд хязгаар (pgvector-ийн үндсэн
# утга 20000). Маш нарийн filter бүтэн index-ийг гүйхээс сэргийлнэ.
MAX_SCAN_TUPLES = 20_000


@dataclass(frozen=True)
class SearchFilters:
    """Талбар бүр заавал биш; нэг талбарт хэд хэдэн утга өгвөл "аль нэг нь" гэсэн утгатай."""

    genders: tuple[str, ...] = ()
    master_categories: tuple[str, ...] = ()
    sub_categories: tuple[str, ...] = ()
    article_types: tuple[str, ...] = ()
    base_colours: tuple[str, ...] = ()
    seasons: tuple[str, ...] = ()
    usages: tuple[str, ...] = ()
    # Навигацийн зангилааны хамарсан leaf ангиллууд; catalog service тодорхойлно.
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


ProductSort = Literal["newest", "price_asc", "price_desc", "relevance", "rating", "popular"]

# Зарагдсан гэж тооцох захиалгын төлөв (орлогын тооцоотой ижил: буцаагдсан, цуцлагдсан биш).
SOLD_STATUSES = ("paid", "shipped", "delivered")
# Ойролцоо хайлтын босго: pg_trgm `word_similarity`. Хэт бага бол хамааралгүй бараа орно.
FUZZY_THRESHOLD = 0.4


def _sold_units() -> Subquery:
    """Бараа бүрийн зарагдсан нийт ширхэг (`popular` эрэмбэд)."""
    return (
        select(
            OrderItem.product_id.label("product_id"),
            func.sum(OrderItem.quantity).label("units"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.status.in_(SOLD_STATUSES))
        .group_by(OrderItem.product_id)
        .subquery()
    )


# Мөрүүд карт болон JSON болж харагддаг: 2 KB vector болон tsvector хэрэггүй, ачаалбал нэг үр дүнд
# уншигдах байт ойролцоогоор хоёр дахин нэмэгдэнэ.
_LIGHT_ROWS: tuple[ExecutableOption, ...] = (
    defer(Product.embedding),
    defer(Product.search_vector),
)


# Хэт урт цифр мөр bigint id байж чадахгүй.
MAX_ID_DIGITS = 18
AdminStatus = Literal["all", "active", "inactive"]
AdminSort = Literal["newest", "price_asc", "price_desc", "stock_asc"]


@dataclass(frozen=True)
class SimilarProduct:
    product: Product
    similarity: float  # cosine similarity, 1.0 = ижил чиглэл


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
        """Id-аар бараа авна, идэвхгүй нь орно (cart-ын мөр татгалзсан барааг ч харуулах ёстой).
        `for_update` нь мөрүүдийг id-н дарааллаар түгжинэ: олон бараа түгжих transaction бүр
        ижил дарааллаар хийдэг тул хоёр checkout deadlock-д орохгүй."""
        if not product_ids:
            return {}
        statement = (
            select(Product)
            .where(Product.id.in_(set(product_ids)))
            .options(*_LIGHT_ROWS)
            .order_by(Product.id)
        )
        if for_update:
            # populate_existing: түгжээн дор уншсан утга session-ийн өмнө cache хийсэн утгыг солих
            # ёстой, үгүй бол нөөцийн тооцоо хуучин тооноос эхэлнэ.
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
        """Catalogue-ийн нэг хуудас болон таарсан нийт тоо.

        Эрэмбэ үргэлж `id`-ээр төгсдөг: олон бараа ижил үнэ эсвэл rank-тай үед хуудсууд
        давхцахгүй, мөр алгасахгүй."""
        clauses = filters.clauses()
        rank = None
        if text_query:
            # websearch_to_tsquery хэрэглэгчийн шууд текстийг (хашилт, "or", "-үг") алдаагүй авна.
            query = func.websearch_to_tsquery(literal_column("'english'::regconfig"), text_query)
            clauses.append(Product.search_vector.op("@@")(query))
            rank = func.ts_rank(Product.search_vector, query)

        statement, order = self._sorted(select(Product).where(*clauses), sort, rank)
        total = (
            await self._session.execute(select(func.count()).select_from(Product).where(*clauses))
        ).scalar_one()
        rows = await self._session.execute(
            statement.order_by(*order).offset(offset).limit(limit).options(*_LIGHT_ROWS)
        )
        return list(rows.scalars()), total

    async def list_products_fuzzy(
        self,
        *,
        filters: SearchFilters,
        text_query: str,
        sort: ProductSort,
        offset: int,
        limit: int,
    ) -> tuple[list[Product], int]:
        """`list_products`-тай ижил, гэхдээ `text_query`-г барааны нэрэнд үсгийн алдаа тэсвэрлэн
        таардаг (trigram). Яг таарах хайлт хоосон үед л дуудна: энэ нь зөв үгэнд хайлтыг
        удаашруулахгүй, алдаатай үгэнд ч хоосон хуудас үлдээхгүй."""
        # `<%` оператор нь session-ийн босгыг ашигладаг: transaction-д л хүчинтэй.
        await self._session.execute(
            text(f"SET LOCAL pg_trgm.word_similarity_threshold = {FUZZY_THRESHOLD}")
        )
        clauses = filters.clauses()
        clauses.append(literal(text_query).op("<%")(Product.name))
        rank = func.word_similarity(text_query, Product.name)
        statement, order = self._sorted(select(Product).where(*clauses), sort, rank)
        total = (
            await self._session.execute(select(func.count()).select_from(Product).where(*clauses))
        ).scalar_one()
        rows = await self._session.execute(
            statement.order_by(*order).offset(offset).limit(limit).options(*_LIGHT_ROWS)
        )
        return list(rows.scalars()), total

    @staticmethod
    def _sorted(
        statement: Select[Any], sort: ProductSort, rank: Any
    ) -> tuple[Select[Any], list[UnaryExpression[Any]]]:
        """Эрэмбийн дараалал (болон `popular`-д шаардлагатай join). Үргэлж `id`-ээр төгсдөг."""
        if sort == "price_asc":
            return statement, [Product.price_cents.asc(), Product.id.asc()]
        if sort == "price_desc":
            return statement, [Product.price_cents.desc(), Product.id.asc()]
        if sort == "relevance" and rank is not None:
            return statement, [rank.desc(), Product.id.asc()]
        if sort == "rating":
            return statement, [
                Product.rating_average.desc(),
                Product.rating_count.desc(),
                Product.id.asc(),
            ]
        if sort == "popular":
            sold = _sold_units()
            joined = statement.outerjoin(sold, sold.c.product_id == Product.id)
            return joined, [
                func.coalesce(sold.c.units, 0).desc(),
                Product.created_at.desc(),
                Product.id.desc(),
            ]
        return statement, [Product.created_at.desc(), Product.id.desc()]

    async def complementary(
        self,
        *,
        sub_category: str,
        genders: Sequence[str],
        usage: str | None,
        limit: int,
    ) -> list[Product]:
        """Тухайн дэд ангилалын зарагдаж буй, нөөцтэй бараа: ижил `usage`-тай нь түрүүлж, дараа нь
        хамгийн их зарагдсан нь. Look-ийг гүйцээхэд ашиглана."""
        sold = _sold_units()
        same_usage = case((Product.usage == usage, 1), else_=0) if usage else literal(0)
        rows = await self._session.execute(
            select(Product)
            .outerjoin(sold, sold.c.product_id == Product.id)
            .where(
                Product.is_active.is_(True),
                Product.stock_quantity > 0,
                Product.sub_category == sub_category,
                Product.gender.in_(genders),
            )
            .order_by(same_usage.desc(), func.coalesce(sold.c.units, 0).desc(), Product.id.asc())
            .limit(limit)
            .options(*_LIGHT_ROWS)
        )
        return list(rows.scalars())

    async def sitemap_entries(
        self, *, offset: int, limit: int
    ) -> tuple[list[tuple[int, str, datetime]], int]:
        """Идэвхтэй барааны (id, slug, updated_at) id-н дарааллаар, мөн нийт тоо."""
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

    # --- admin: доорх бүх зүйл идэвхгүй барааг ч харна ---

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
        stock: str = "all",
        low_stock_threshold: int = 5,
    ) -> tuple[list[Product], int]:
        """Admin-ы жагсаалт. Нэрээр энгийн substring хайлт (эсвэл яг id), учир нь admin үгийн
        хагасыг бичдэг; storefront-ийн stemmed full-text хайлт үүнийг олохгүй."""
        clauses: list[ColumnElement[bool]] = []
        if text_query:
            by_name = Product.name.ilike(contains_pattern(text_query), escape="\\")
            is_id = text_query.isdigit() and len(text_query) <= MAX_ID_DIGITS
            clauses.append(or_(by_name, Product.id == int(text_query)) if is_id else by_name)
        if status != "all":
            clauses.append(Product.is_active.is_(status == "active"))
        if category_id is not None:
            clauses.append(Product.category_id == category_id)
        if stock == "out":
            clauses.append(Product.stock_quantity == 0)
        elif stock == "low":
            clauses.append(Product.stock_quantity.between(1, low_stock_threshold))
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
        """Database-ийн үүсгэсэн timestamp-уудыг flush хийж дахин уншина (бичилтээр хүчингүй
        болсон, async кодод lazy reload хийх боломжгүй)."""
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
        """HNSW index ашиглан cosine similarity-ээр шилдэг `limit` бараа.

        Filter-тэй HNSW хайлт бол сонгодог асуудалтай: index `ef_search` candidate буцаагаад
        WHERE нөхцөл ихэнхийг нь хаяснаар `limit`-ээс цөөн мөр үлдэж болно. pgvector >= 0.8
        iterative scan нь filter-ээс хангалттай мөр гарах хүртэл index-ийг үргэлжлүүлэн
        сканддаг тул илүү татах шаардлагагүй. `relaxed_order` хурдан боловч мөрүүдийг жаахан
        эмх замбараагүй буцааж болно, тиймээс энд дахин эрэмбэлнэ (limit жижиг)."""
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

        # set_config(..., is_local=true) нь bind parameter-тэй SET LOCAL: зөвхөн одоогийн
        # transaction-д үйлчилнэ, тиймээс pool-ийн connection-ийг ашиглах бусдад нөлөөлөхгүй. Нэг
        # statement = нэг round trip.
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
