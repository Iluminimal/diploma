from fastapi import APIRouter, Header, Request

from angel.core.deps import WebhookServiceDep
from angel.core.errors import ProblemError
from angel.schemas.problem import ProblemDetail

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Stripe-ийн төлбөрийн event хэдхэн KB. Signature шалгахын тулд body-г бүтнээр нь уншдаг тул
# хэмжээг хязгаарлана.
MAX_WEBHOOK_BYTES = 256 * 1024


async def _read_limited(request: Request) -> bytes:
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_WEBHOOK_BYTES:
            raise ProblemError(413, "Webhook body too large")
    return bytes(body)


@router.post(
    "/stripe",
    summary="Stripe webhook (payment_intent.succeeded / payment_failed / canceled)",
    description=(
        "Server-to-server: authenticated by the `Stripe-Signature` header, not by a session. "
        "Idempotent by event id, so redeliveries are acknowledged and ignored."
    ),
    responses={
        400: {"model": ProblemDetail, "description": "Bad or missing signature"},
        503: {"model": ProblemDetail, "description": "Payments not configured"},
    },
)
async def stripe_webhook(
    request: Request,
    service: WebhookServiceDep,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict[str, bool]:
    # Parse хийсэн model биш raw bytes: signature нь Stripe-ийн илгээсэн яг bytes дээр бодогддог.
    await service.handle(await _read_limited(request), stripe_signature)
    return {"received": True}
