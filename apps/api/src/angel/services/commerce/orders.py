import math
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    INVALID_TRANSITION_TYPE,
    ORDER_NOT_FOUND_TYPE,
    PAYMENT_PROVIDER_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.payments import PaymentGateway, PaymentProviderError
from angel.repositories.commerce.orders import OrderRepository
from angel.schemas.commerce.order import OrderOut, OrderPage
from angel.services.commerce.order_lifecycle import release_order
from angel.services.mappers import to_order_out, to_order_summary
from angel.storage import Storage

log = get_logger(__name__)


class OrderService:
    def __init__(
        self,
        session: AsyncSession,
        storage: Storage,
        settings: Settings,
        gateway: PaymentGateway | None,
    ) -> None:
        self._session = session
        self._storage = storage
        self._settings = settings
        self._gateway = gateway
        self._orders = OrderRepository(session)

    async def list(self, user_id: int, *, page: int, page_size: int) -> OrderPage:
        async with self._session.begin():
            total = await self._orders.count_for_user(user_id)
            rows = await self._orders.list_for_user(
                user_id, limit=page_size, offset=(page - 1) * page_size
            )
            items = [to_order_summary(order, self._storage) for order in rows]
        return OrderPage(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size),
        )

    async def get(self, user_id: int, number: str) -> OrderOut:
        async with self._session.begin():
            order = await self._orders.get_for_user(user_id, number)
            if order is None:
                raise _not_found(number)
            return to_order_out(
                order, self._storage, pending_ttl_minutes=self._settings.order_pending_ttl_minutes
            )

    async def cancel(self, user_id: int, number: str) -> OrderOut:
        """Худалдан авагч өөрөө төлөгдөөгүй (pending) захиалгаа цуцална: нөөц буцна, нэхэмжлэх
        provider дээр хаагдана. Төлөгдсөн захиалгыг цуцлахгүй (буцаалт админаар)."""
        async with self._session.begin():
            order = await self._orders.get_for_user(user_id, number)
            if order is None:
                raise _not_found(number)
            if order.status != "pending":
                raise _not_cancellable()
            order_id = order.id
            intent_id = order.payment.provider_payment_id if order.payment else None
        if intent_id is not None and self._gateway is not None:
            try:
                outcome = await self._gateway.cancel_intent(intent_id)
            except PaymentProviderError as exc:
                raise ProblemError(
                    HTTPStatus.BAD_GATEWAY,
                    "Төлбөрийн үйлчилгээ боломжгүй",
                    "Захиалгыг цуцалж чадсангүй. Дахин оролдоно уу.",
                    type_=PAYMENT_PROVIDER_TYPE,
                ) from exc
            if outcome == "succeeded":
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Захиалга дөнгөж төлөгдлөө",
                    "Төлбөр хэсэг хугацааны өмнө хийгдсэн. Захиалгаа шинэчилж харна уу.",
                    type_=INVALID_TRANSITION_TYPE,
                )
        async with self._session.begin():
            locked = await self._orders.get_for_update(order_id)
            if locked is None or not await release_order(
                self._session, locked, "customer", actor=(user_id, "customer")
            ):
                raise _not_cancellable()
        log.info("order_cancelled_by_customer", order=number)
        return await self.get(user_id, number)


def _not_found(number: str) -> ProblemError:
    # Өөр хүний захиалгын дугаар ч үүнийг авна: байгаа эсэхийг шалгах арга байхгүй.
    return ProblemError(
        HTTPStatus.NOT_FOUND,
        "Захиалга олдсонгүй",
        f"Таны бүртгэлд {number} дугаартай захиалга байхгүй байна.",
        type_=ORDER_NOT_FOUND_TYPE,
    )


def _not_cancellable() -> ProblemError:
    return ProblemError(
        HTTPStatus.CONFLICT,
        "Энэ захиалгыг цуцлах боломжгүй",
        "Зөвхөн төлбөр хүлээж буй захиалгыг цуцалж болно.",
        type_=INVALID_TRANSITION_TYPE,
    )
