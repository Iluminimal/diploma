"""Захиалга: бүх customer-ийн захиалга, мөн захиалгыг дараагийн төлөвт шилжүүлэх үйлдлүүд."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query

from angel.core.deps import (
    AdminDep,
    AdminOrderServiceDep,
    FulfillmentServiceDep,
)
from angel.schemas.admin.orders import (
    AdminOrderListQuery,
    AdminOrderOut,
    AdminOrderPage,
    CancelRequest,
    NoteRequest,
    RefundRequest,
    ShipRequest,
)
from angel.schemas.problem import ProblemDetail

# Rate limit, role шалгалт нь __init__.py дахь router-т нэг дор хийгддэг (эхлээд rate limit).

router = APIRouter()

_CONFLICT: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "No such order"},
    409: {"model": ProblemDetail, "description": "The order is not in a state this applies to"},
}


@router.get("/orders", summary="Every customer's orders, newest first")
async def list_orders(
    query: Annotated[AdminOrderListQuery, Query()], service: AdminOrderServiceDep
) -> AdminOrderPage:
    return await service.list(query)


@router.get(
    "/orders/{number}",
    summary="One order with its payment record",
    responses={404: {"model": ProblemDetail, "description": "No such order"}},
)
async def get_order(
    number: Annotated[str, Path(min_length=4, max_length=20)], service: AdminOrderServiceDep
) -> AdminOrderOut:
    return await service.get(number)


@router.post("/orders/{number}/ship", summary="Mark a paid order as shipped", responses=_CONFLICT)
async def ship_order(
    number: Annotated[str, Path(max_length=20)],
    body: ShipRequest,
    admin: AdminDep,
    service: FulfillmentServiceDep,
) -> AdminOrderOut:
    return await service.ship(number, admin, body)


@router.post(
    "/orders/{number}/deliver", summary="Mark a shipped order as delivered", responses=_CONFLICT
)
async def deliver_order(
    number: Annotated[str, Path(max_length=20)], admin: AdminDep, service: FulfillmentServiceDep
) -> AdminOrderOut:
    return await service.deliver(number, admin)


@router.post(
    "/orders/{number}/cancel",
    summary="Cancel an unpaid order",
    description="Gives the reserved stock back. A paid order is refunded instead.",
    responses=_CONFLICT,
)
async def cancel_order(
    number: Annotated[str, Path(max_length=20)],
    admin: AdminDep,
    service: FulfillmentServiceDep,
    body: CancelRequest | None = None,
) -> AdminOrderOut:
    return await service.cancel(number, admin, body or CancelRequest())


@router.post(
    "/orders/{number}/refund",
    summary="Refund a paid, shipped or delivered order in full",
    responses={**_CONFLICT, 502: {"model": ProblemDetail, "description": "Provider unavailable"}},
)
async def refund_order(
    number: Annotated[str, Path(max_length=20)],
    body: RefundRequest,
    admin: AdminDep,
    service: FulfillmentServiceDep,
) -> AdminOrderOut:
    return await service.refund(number, admin, body)


@router.post("/orders/{number}/notes", summary="Add an internal note", responses=_CONFLICT)
async def add_order_note(
    number: Annotated[str, Path(max_length=20)],
    body: NoteRequest,
    admin: AdminDep,
    service: FulfillmentServiceDep,
) -> AdminOrderOut:
    return await service.add_note(number, admin, body)
