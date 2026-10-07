from fastapi import APIRouter

from lookalike.core.deps import CatalogServiceDep
from lookalike.schemas.catalog import CatalogFilters

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/filters", summary="Categories and filter options for building a filter UI")
async def catalog_filters(service: CatalogServiceDep) -> CatalogFilters:
    return await service.filters()
