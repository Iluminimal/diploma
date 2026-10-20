import math
from dataclasses import replace
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import CATEGORY_NOT_FOUND_TYPE, PRODUCT_NOT_FOUND_TYPE, ProblemError
from angel.models import Category
from angel.repositories.catalog.categories import CategoryRepository
from angel.repositories.catalog.products import ProductRepository, ProductSort, SearchFilters
from angel.schemas.catalog.catalog import (
    CatalogFilters,
    CatalogNav,
    CategoryNode,
    PriceRange,
    SitemapEntry,
    SitemapPage,
    SitemapQuery,
)
from angel.schemas.catalog.product import ProductListQuery, ProductOut, ProductPage
from angel.services.cache import SearchCache
from angel.services.catalog.taxonomy import (
    DEPARTMENT_BY_SLUG,
    TaxonomySnapshot,
    build_snapshot,
)
from angel.services.mappers import to_product_out, to_search_filters
from angel.storage import Storage


def build_category_tree(categories: list[Category]) -> list[CategoryNode]:
    nodes = {
        c.id: CategoryNode(id=c.id, name=c.name, slug=c.slug, path=c.path, level=c.level)
        for c in categories
    }
    roots: list[CategoryNode] = []
    for category in categories:
        parent = nodes.get(category.parent_id) if category.parent_id is not None else None
        (parent.children if parent else roots).append(nodes[category.id])
    return roots


class CatalogService:
    def __init__(self, session: AsyncSession, storage: Storage, cache: SearchCache) -> None:
        self._session = session
        self._storage = storage
        self._cache = cache

    async def list_products(self, query: ProductListQuery) -> ProductPage:
        sort: ProductSort = query.sort or ("relevance" if query.q else "newest")
        if sort == "relevance" and not query.q:
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Invalid sort",
                "Sorting by relevance needs a search term (q).",
            )
        filters = await self._navigation_filters(query)
        if filters is None:
            return ProductPage(
                items=[], total=0, page=query.page, page_size=query.page_size, pages=0
            )
        async with self._session.begin():
            products, total = await ProductRepository(self._session).list_products(
                filters=filters,
                text_query=query.q,
                sort=sort,
                offset=(query.page - 1) * query.page_size,
                limit=query.page_size,
            )
        return ProductPage(
            items=[to_product_out(p, self._storage) for p in products],
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
        )

    async def _navigation_filters(self, query: ProductListQuery) -> SearchFilters | None:
        """Query-ийн filter-үүд, `department` болон `category`-г тодорхойлсон байдлаар, эсвэл бүх
        барааг хасвал None (department болон давхцахгүй gender-ийг зэрэг заасан үед)."""
        filters = to_search_filters(query)
        if query.department is not None:
            department = DEPARTMENT_BY_SLUG.get(query.department)
            if department is None:
                raise _category_not_found(f"There is no department {query.department!r}.")
            genders = (
                tuple(g for g in filters.genders if g in department.genders)
                if filters.genders
                else department.genders
            )
            if not genders:
                return None
            filters = replace(filters, genders=genders)
        if query.category is not None:
            snapshot = await self.taxonomy()
            ids = snapshot.category_ids.get(query.category.strip("/"))
            if ids is None:
                raise _category_not_found(f"There is no category {query.category!r}.")
            filters = replace(filters, category_ids=tuple(ids))
        return filters

    async def get_product(self, product_id: int) -> ProductOut:
        async with self._session.begin():
            product = await ProductRepository(self._session).get_by_id(product_id)
        if product is None:
            raise ProblemError(
                HTTPStatus.NOT_FOUND,
                "Product not found",
                f"There is no product with id {product_id}.",
                type_=PRODUCT_NOT_FOUND_TYPE,
            )
        return to_product_out(product, self._storage)

    async def sitemap(self, query: SitemapQuery) -> SitemapPage:
        async with self._session.begin():
            rows, total = await ProductRepository(self._session).sitemap_entries(
                offset=(query.page - 1) * query.page_size, limit=query.page_size
            )
        return SitemapPage(
            items=[SitemapEntry(id=i, slug=slug, updated_at=at) for i, slug, at in rows],
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
        )

    async def filters(self) -> CatalogFilters:
        """Зөвхөн бараа нэмэгдэх эсвэл өнгө нь солигдоход өөрчлөгддөг, тиймээс хэдэн минутын
        cache хэрэглэгчид мэдэгдэхгүй бөгөөд хуудас бүрт хэд хэдэн DISTINCT scan хэмнэнэ."""
        cached = await self._cache.get_catalog_filters()
        if cached is not None:
            return cached
        async with self._session.begin():
            repository = CategoryRepository(self._session)
            categories = await repository.all_categories()
            options = await repository.filter_options()
        result = CatalogFilters(
            categories=build_category_tree(categories),
            genders=options.genders,
            colors=options.colours,
            seasons=options.seasons,
            usages=options.usages,
            price_range=PriceRange(
                min_cents=options.min_price_cents, max_cents=options.max_price_cents
            ),
        )
        await self._cache.set_catalog_filters(result)
        return result

    async def taxonomy(self) -> TaxonomySnapshot:
        """Тоотой department-ууд болон зангилаа бүрийн ард буй id-нууд. Тоо нь зөвхөн catalogue
        өөрчлөгдөхөд өөрчлөгддөг тул filter сонголттой хамт cache хийнэ."""
        cached = await self._cache.get_taxonomy()
        if cached is not None:
            return cached
        async with self._session.begin():
            repository = CategoryRepository(self._session)
            categories = await repository.all_categories()
            counts = await repository.gender_category_counts()
        snapshot = build_snapshot(categories, counts)
        await self._cache.set_taxonomy(snapshot)
        return snapshot

    async def nav(self) -> CatalogNav:
        return (await self.taxonomy()).nav


def _category_not_found(detail: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.NOT_FOUND, "Category not found", detail, type_=CATEGORY_NOT_FOUND_TYPE
    )
