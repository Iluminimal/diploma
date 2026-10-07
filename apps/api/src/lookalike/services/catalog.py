import math
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.core.errors import PRODUCT_NOT_FOUND_TYPE, ProblemError
from lookalike.models import Category
from lookalike.repositories.categories import CategoryRepository
from lookalike.repositories.products import ProductRepository, ProductSort
from lookalike.schemas.catalog import CatalogFilters, CategoryNode, PriceRange
from lookalike.schemas.product import ProductListQuery, ProductOut, ProductPage
from lookalike.services.cache import SearchCache
from lookalike.services.mappers import to_product_out, to_search_filters
from lookalike.storage import Storage


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
        async with self._session.begin():
            products, total = await ProductRepository(self._session).list_products(
                filters=to_search_filters(query),
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

    async def filters(self) -> CatalogFilters:
        """Changes only when products are added or recoloured, so a few minutes of caching is
        invisible to users and saves several DISTINCT scans per page view."""
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
