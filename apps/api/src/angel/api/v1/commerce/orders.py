from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query

from angel.core.deps import CartServiceDep, CurrentUserDep, OrderServiceDep, ShoppingGuard, no_store
from angel.schemas.commerce.cart import ReorderOut
from angel.schemas.commerce.order import OrderOut, OrderPage
from angel.schemas.problem import ProblemDetail

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


@router.post(
    "/{number}/cancel",
    summary="Cancel an order that is still waiting for payment",
    description=(
        "Releases the reserved stock and closes the payment invoice. Only orders that have not "
        "been paid can be cancelled; paid orders are refunded by an administrator."
    ),
    responses={
        404: {"model": ProblemDetail, "description": "Not one of your orders"},
        409: {"model": ProblemDetail, "description": "The order is not waiting for payment"},
        502: {"model": ProblemDetail, "description": "The payment provider failed"},
    },
)
async def cancel_order(
    number: Annotated[str, Path(min_length=4, max_length=20)],
    user_id: CurrentUserDep,
    service: OrderServiceDep,
) -> OrderOut:
    return await service.cancel(user_id, number)


@router.post(
    "/{number}/reorder",
    summary="Put the items of one of your orders back in the bag",
    description=(
        "Each line goes in with the same size and quantity, limited by what is in stock now. Lines "
        "that cannot go in (sold out, withdrawn, bag full) or only partly are listed in `skipped`."
    ),
    responses={
        403: {"model": ProblemDetail, "description": "Staff accounts do not shop"},
        404: {"model": ProblemDetail, "description": "Not one of your orders"},
    },
)
async def reorder(
    number: Annotated[str, Path(min_length=4, max_length=20)],
    user_id: CurrentUserDep,
    _guard: ShoppingGuard,
    service: CartServiceDep,
) -> ReorderOut:
    return await service.reorder(user_id, number)
