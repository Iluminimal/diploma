from typing import Annotated

from fastapi import APIRouter, Query, Response

from angel.core.deps import CatalogServiceDep
from angel.schemas.catalog.catalog import CatalogFilters, CatalogNav, SitemapPage, SitemapQuery

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/filters", summary="Categories and filter options for building a filter UI")
async def catalog_filters(service: CatalogServiceDep) -> CatalogFilters:
    return await service.filters()


@router.get(
    "/nav",
    summary="Departments with their category tree and product counts",
    description="Women, Men and Kids, each with Clothing / Shoes / Accessories groups, "
    "sub-categories and article types. Node paths feed the `category` listing filter.",
)
async def catalog_nav(service: CatalogServiceDep, response: Response) -> CatalogNav:
    response.headers["Cache-Control"] = "public, max-age=300"
    return await service.nav()


@router.get(
    "/sitemap",
    summary="Active products (id, slug, last change) for building a sitemap",
    description="Pages of up to 10,000 products in id order.",
)
async def catalog_sitemap(
    query: Annotated[SitemapQuery, Query()], service: CatalogServiceDep, response: Response
) -> SitemapPage:
    response.headers["Cache-Control"] = "public, max-age=300"
    return await service.sitemap(query)
