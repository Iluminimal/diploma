from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from lookalike.core.deps import CurrentUserDep, OrderServiceDep, no_store
from lookalike.schemas.order import OrderOut, OrderPage
from lookalike.schemas.problem import ProblemDetail

router = APIRouter(
    prefix="/orders",
    tags=["orders"],
    dependencies=[Depends(no_store)],
    responses={401: {"model": ProblemDetail, "description": "Not signed in"}},
)


@router.get("", summary="Your orders, newest first")
async def list_orders(
    user_id: CurrentUserDep,
    service: OrderServiceDep,
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=50)] = 10,
) -> OrderPage:
    return await service.list(user_id, page=page, page_size=page_size)


@router.get(
    "/{number}",
    summary="One of your orders, with the prices as they were charged",
    responses={404: {"model": ProblemDetail, "description": "Not one of your orders"}},
)
async def get_order(
    number: Annotated[str, Path(min_length=4, max_length=20)],
    user_id: CurrentUserDep,
    service: OrderServiceDep,
) -> OrderOut:
    return await service.get(user_id, number)
