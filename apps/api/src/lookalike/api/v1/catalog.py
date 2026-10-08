from typing import Annotated

from fastapi import APIRouter, Query, Response

from lookalike.core.deps import CatalogServiceDep
from lookalike.schemas.catalog import CatalogFilters, SitemapPage, SitemapQuery

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/filters", summary="Categories and filter options for building a filter UI")
async def catalog_filters(service: CatalogServiceDep) -> CatalogFilters:
    return await service.filters()


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
