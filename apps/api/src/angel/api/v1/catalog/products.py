from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query, Response

from angel.core.deps import (
    CatalogServiceDep,
    CurrentUserDep,
    OptionalUserDep,
    ReviewServiceDep,
    SearchServiceDep,
)
from angel.core.rate_limit import rate_limit
from angel.schemas.catalog.product import ProductListQuery, ProductOut, ProductPage
from angel.schemas.catalog.search import SearchResponse, SimilarQuery
from angel.schemas.problem import ProblemDetail
from angel.schemas.reviews.reviews import ReviewCreate, ReviewListQuery, ReviewOut, ReviewPage
from angel.services.mappers import to_search_filters

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


@router.get(
    "/{product_id}/reviews",
    summary="Published reviews with the average, and what the signed-in visitor can do",
    responses=_NOT_FOUND,
)
async def list_reviews(
    product_id: ProductId,
    query: Annotated[ReviewListQuery, Query()],
    user_id: OptionalUserDep,
    service: ReviewServiceDep,
    response: Response,
) -> ReviewPage:
    if user_id is not None:
        # The viewer's own review is in it.
        response.headers["Cache-Control"] = "no-store"
    return await service.list(product_id, query, user_id)


@router.post(
    "/{product_id}/reviews",
    status_code=201,
    summary="Review a product you bought",
    dependencies=[Depends(rate_limit("review"))],
    responses={
        **_NOT_FOUND,
        403: {"model": ProblemDetail, "description": "You have not bought it"},
        409: {"model": ProblemDetail, "description": "You already reviewed it"},
    },
)
async def create_review(
    product_id: ProductId,
    body: ReviewCreate,
    user_id: CurrentUserDep,
    service: ReviewServiceDep,
) -> ReviewOut:
    return await service.create(user_id, product_id, body)
