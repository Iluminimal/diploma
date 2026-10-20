from http import HTTPStatus

from angel.core.errors import INVALID_SIGNATURE_TYPE, PAYMENTS_UNAVAILABLE_TYPE, ProblemError
from angel.payments import InvalidSignatureError, PaymentGateway, PaymentProviderError
from angel.services.commerce.payments import PaymentSettlement


class WebhookService:
    def __init__(self, gateway: PaymentGateway, settlement: PaymentSettlement) -> None:
        self._gateway = gateway
        self._settlement = settlement

    async def handle(self, payload: bytes, signature: str | None) -> None:
        """Эхлээд шалгаад, дараа нь хэрэглэнэ. Гарын үсэггүйг body задлахаас өмнө татгалзана."""
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
        if event is None:  # хэрэглэдэггүй төрлийн event: хүлээн авснаа мэдэгдээд үл хэрэгсэнэ
            return
        try:
            await self._settlement.handle(event)
        except PaymentProviderError as exc:
            # Жишээ нь refund дуудлага амжилтгүй. Юу ч бүртгэгдээгүй, тиймээс 5xx нь Stripe-ийг
            # дахин хүргүүлнэ.
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Could not settle the payment yet",
                "Try again; the event has not been applied.",
                type_=PAYMENTS_UNAVAILABLE_TYPE,
            ) from exc
