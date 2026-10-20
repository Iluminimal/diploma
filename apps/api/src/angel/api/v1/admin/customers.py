"""Customer: хэн account-тай, юу худалдаж авсан, түр түдгэлзүүлэх ба сэргээх."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query

from angel.core.deps import (
    AdminDashboardServiceDep,
    AdminDep,
)
from angel.schemas.admin.dashboard import (
    AdminCustomerDetail,
    AdminCustomerListQuery,
    AdminCustomerPage,
)
from angel.schemas.problem import ProblemDetail

# Rate limit, role шалгалт нь __init__.py дахь router-т нэг дор хийгддэг (эхлээд rate limit).

router = APIRouter()

_CUSTOMER_ACTION: dict[int | str, dict[str, Any]] = {
    403: {"model": ProblemDetail, "description": "Yourself or an administrator"},
    404: {"model": ProblemDetail, "description": "No such customer"},
}


@router.get("/customers", summary="Customers with what they have bought")
async def list_customers(
    query: Annotated[AdminCustomerListQuery, Query()], service: AdminDashboardServiceDep
) -> AdminCustomerPage:
    return await service.customers(query)


@router.get(
    "/customers/{user_id}",
    summary="One customer with their latest orders",
    responses={404: {"model": ProblemDetail, "description": "No such customer"}},
)
async def get_customer(
    user_id: Annotated[int, Path(ge=1, le=2**63 - 1)], service: AdminDashboardServiceDep
) -> AdminCustomerDetail:
    return await service.customer(user_id)


@router.post(
    "/customers/{user_id}/deactivate",
    summary="Suspend a customer",
    description="They are signed out everywhere and cannot sign in again until reinstated.",
    responses=_CUSTOMER_ACTION,
)
async def deactivate_customer(
    user_id: Annotated[int, Path(ge=1, le=2**63 - 1)],
    admin: AdminDep,
    service: AdminDashboardServiceDep,
) -> AdminCustomerDetail:
    return await service.set_active(admin, user_id, active=False)


@router.post(
    "/customers/{user_id}/activate", summary="Reinstate a customer", responses=_CUSTOMER_ACTION
)
async def activate_customer(
    user_id: Annotated[int, Path(ge=1, le=2**63 - 1)],
    admin: AdminDep,
    service: AdminDashboardServiceDep,
) -> AdminCustomerDetail:
    return await service.set_active(admin, user_id, active=True)
