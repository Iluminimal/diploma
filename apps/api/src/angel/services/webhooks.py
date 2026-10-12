from http import HTTPStatus

from angel.core.errors import INVALID_SIGNATURE_TYPE, PAYMENTS_UNAVAILABLE_TYPE, ProblemError
from angel.payments import InvalidSignatureError, PaymentGateway, PaymentProviderError
from angel.services.payments import PaymentSettlement


class WebhookService:
    def __init__(self, gateway: PaymentGateway, settlement: PaymentSettlement) -> None:
        self._gateway = gateway
        self._settlement = settlement

    async def handle(self, payload: bytes, signature: str | None) -> None:
        """Verify, then apply. Anything unsigned is rejected before the body is parsed."""
        try:
            event = self._gateway.parse_event(payload, signature)
        except InvalidSignatureError as exc:
            raise ProblemError(
                HTTPStatus.BAD_REQUEST,
                "Invalid webhook signature",
                type_=INVALID_SIGNATURE_TYPE,
            ) from exc
        except PaymentProviderError as exc:
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Webhooks are not configured",
                type_=PAYMENTS_UNAVAILABLE_TYPE,
            ) from exc
        if event is None:  # event types we do not act on are acknowledged and ignored
            return
        try:
            await self._settlement.handle(event)
        except PaymentProviderError as exc:
            # E.g. the refund call failed. Nothing was recorded, so a 5xx makes Stripe redeliver.
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Could not settle the payment yet",
                "Try again; the event has not been applied.",
                type_=PAYMENTS_UNAVAILABLE_TYPE,
            ) from exc
