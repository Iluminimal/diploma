from typing import Annotated

from fastapi import APIRouter, Depends, Query

from angel.core.deps import WebhookServiceDep
from angel.core.rate_limit import rate_limit
from angel.schemas.problem import ProblemDetail

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

OrderQuery = Annotated[str, Query(min_length=4, max_length=20, pattern=r"^[A-Za-z0-9\-]+$")]


@router.api_route(
    "/qpay",
    methods=["GET", "POST"],
    summary="QPay payment notification (callback_url)",
    description=(
        "Server-to-server, no session. QPay calls this after a payment; the notification is not "
        "signed, so it is only a trigger: the payment is always confirmed with QPay's "
        "`payment/check` before the order changes. Repeated notifications are harmless."
    ),
    dependencies=[Depends(rate_limit("payment_check"))],
    responses={503: {"model": ProblemDetail, "description": "Payment check failed, retry later"}},
)
async def qpay_callback(order: OrderQuery, service: WebhookServiceDep) -> dict[str, bool]:
    await service.payment_callback(order)
    return {"received": True}
