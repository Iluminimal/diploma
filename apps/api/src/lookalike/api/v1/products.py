from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query

from lookalike.core.deps import CatalogServiceDep, SearchServiceDep
from lookalike.core.rate_limit import rate_limit
from lookalike.schemas.problem import ProblemDetail
from lookalike.schemas.product import ProductListQuery, ProductOut, ProductPage
from lookalike.schemas.search import SearchResponse, SimilarQuery
from lookalike.services.mappers import to_search_filters

router = APIRouter(prefix="/products", tags=["products"])

ProductId = Annotated[int, Path(ge=1, le=2**63 - 1)]
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "Unknown or inactive product"}
}


@router.get("", summary="List products with filters, sorting and pagination")
async def list_products(
    query: Annotated[ProductListQuery, Query()], service: CatalogServiceDep
) -> ProductPage:
    return await service.list_products(query)


@router.get("/{product_id}", summary="Get one product", responses=_NOT_FOUND)
async def get_product(product_id: ProductId, service: CatalogServiceDep) -> ProductOut:
    return await service.get_product(product_id)


@router.get(
    "/{product_id}/similar",
    summary="Visually similar products (from the stored embedding)",
    dependencies=[Depends(rate_limit("similar"))],
    responses=_NOT_FOUND,
)
async def similar_products(
    product_id: ProductId, query: Annotated[SimilarQuery, Query()], service: SearchServiceDep
) -> SearchResponse:
    return await service.similar_products(product_id, to_search_filters(query), query.limit)
