"""QPay-ийн мэдэгдэл (callback). Гарын үсэггүй тул түүнд итгэхгүй: зөвхөн тухайн захиалгын төлбөрийг
QPay-ээс шалгах дохио болгоно. Хуурамч мэдэгдэл юу ч өөрчилж чадахгүй, зөвхөн шалгалт ажиллуулна."""

from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import PAYMENTS_UNAVAILABLE_TYPE, ProblemError
from angel.core.logging import get_logger
from angel.payments import PaymentGateway, PaymentProviderError
from angel.repositories.commerce.orders import OrderRepository
from angel.services.commerce.payments import PaymentSettlement

log = get_logger(__name__)


class WebhookService:
    def __init__(
        self, session: AsyncSession, gateway: PaymentGateway, settlement: PaymentSettlement
    ) -> None:
        self._session = session
        self._gateway = gateway
        self._settlement = settlement

    async def payment_callback(self, order_number: str) -> None:
        async with self._session.begin():
            order = await OrderRepository(self._session).get_by_number(order_number)
            intent_id = order.payment.provider_payment_id if order and order.payment else None
        if intent_id is None:
            log.info("payment_callback_unknown_order", order=order_number)
            return
        try:
            event = await self._gateway.check(intent_id)
            if event is not None:
                await self._settlement.handle(event)
        except PaymentProviderError as exc:
            # Шалгалт эсвэл (хожимдсон төлбөрийн) буцаалт амжилтгүй. Юу ч бүртгэгдээгүй тул
            # дараагийн мэдэгдэл эсвэл худалдан авагчийн шалгалт дахин оролдоно.
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Төлбөрийг одоохондоо шалгаж чадсангүй",
                "Дахин оролдоно уу; юу ч хэрэгжээгүй.",
                type_=PAYMENTS_UNAVAILABLE_TYPE,
            ) from exc
