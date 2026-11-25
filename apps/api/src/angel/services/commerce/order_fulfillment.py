"""Administrator захиалгад юу хийж чадах вэ, нэг жижиг state machine болгон.

    pending --cancel--> cancelled
    pending --(payment)--> paid --ship--> shipped --deliver--> delivered
    paid | shipped | delivered --refund--> refunded

Үйлдэл бүр захиалгын мөрийн түгжээг авч (хоёр administrator, эсвэл administrator ба webhook-ийг нэг
нэгээр нь шийднэ), захиалга үйлдэлд тохирох төлөвт байгааг шалгаж (үгүй бол 409), захиалгыг
өөрчилнө. Мөн нэг transaction дотор `OrderEvent` бичиж, commit хийсний дараа хэрэглэгчид email
илгээнэ."""

from collections import defaultdict
from datetime import UTC, datetime
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import (
    INVALID_TRANSITION_TYPE,
    ORDER_NOT_FOUND_TYPE,
    PAYMENT_PROVIDER_TYPE,
    PAYMENTS_UNAVAILABLE_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.core.money import format_minor
from angel.models import Order, User
from angel.payments import PaymentGateway
from angel.payments.gateway import PaymentProviderError
from angel.repositories.admin.audit import AuditRepository
from angel.repositories.catalog.products import ProductRepository
from angel.repositories.commerce.orders import OrderRepository
from angel.schemas.admin.orders import (
    AdminOrderOut,
    CancelRequest,
    NoteRequest,
    RefundRequest,
    ShipRequest,
)
from angel.services.commerce.order_lifecycle import release_order
from angel.services.mappers import to_admin_order_out
from angel.storage import Storage

log = get_logger(__name__)


def _money(order: Order) -> str:
    return format_minor(order.total_cents, order.currency)


class OrderFulfillmentService:
    def __init__(
        self,
        session: AsyncSession,
        gateway: PaymentGateway | None,
        mailer: Mailer,
        storage: Storage,
    ) -> None:
        self._session = session
        self._gateway = gateway
        self._mailer = mailer
        self._storage = storage
        self._orders = OrderRepository(session)
        self._audit = AuditRepository(session)

    # --- үйлдлүүд ---

    async def ship(self, number: str, admin: User, request: ShipRequest) -> AdminOrderOut:
        async with self._session.begin():
            order = await self._lock(number)
            self._require(order, ("paid",), "ship")
            order.status = "shipped"
            order.carrier = request.carrier
            order.tracking_number = request.tracking_number
            order.shipped_at = datetime.now(UTC)
            self._orders.add_event(
                order.id,
                "shipped",
                {
                    "carrier": request.carrier,
                    "tracking_number": request.tracking_number,
                    **_by(admin),
                },
                admin.id,
            )
            self._audit.record(
                admin,
                "order.ship",
                "order",
                number,
                {"carrier": request.carrier, "tracking_number": request.tracking_number},
            )
            email = Email(
                to=order.contact_email,
                subject=f"{order.number} дугаартай захиалга замдаа гарлаа",
                body=f"Баярт мэдээ: {order.number} дугаартай захиалгыг "
                f"{request.carrier}-ээр илгээлээ.\n"
                f"Хяналтын дугаар: {request.tracking_number}",
            )
        log.info("order_shipped", order=number, admin_id=admin.id)
        await self._mailer.send(email)
        return await self._read(number)

    async def deliver(self, number: str, admin: User) -> AdminOrderOut:
        async with self._session.begin():
            order = await self._lock(number)
            self._require(order, ("shipped",), "mark as delivered")
            order.status = "delivered"
            order.delivered_at = datetime.now(UTC)
            self._orders.add_event(order.id, "delivered", _by(admin), admin.id)
            self._audit.record(admin, "order.deliver", "order", number)
            email = Email(
                to=order.contact_email,
                subject=f"{order.number} дугаартай захиалга хүргэгдлээ",
                body=f"{order.number} дугаартай захиалга хүргэгдлээ. "
                "Танд таалагдана гэж найдаж байна!",
            )
        log.info("order_delivered", order=number, admin_id=admin.id)
        await self._mailer.send(email)
        return await self._read(number)

    async def cancel(self, number: str, admin: User, request: CancelRequest) -> AdminOrderOut:
        """Төлөгдөөгүй захиалгыг цуцална: нөөц буцна, эхлээд provider дээр payment intent
        цуцлагдана (expiry sweeper-тэй адил)."""
        async with self._session.begin():
            order = await self._lock_plain(number)
            self._require(order, ("pending",), "cancel")
            intent_id = order.payment.provider_payment_id if order.payment else None
        if intent_id is not None and self._gateway is not None:
            try:
                outcome = await self._gateway.cancel_intent(intent_id)
            except PaymentProviderError as exc:
                raise _provider_error(exc) from exc
            if outcome == "succeeded":
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Захиалга дөнгөж төлөгдлөө",
                    "Төлбөр хэсэг хугацааны өмнө хийгдсэн. Захиалгаа шинэчилж харна уу.",
                    type_=INVALID_TRANSITION_TYPE,
                )
        async with self._session.begin():
            order = await self._lock(number)
            data_user = (admin.id, admin.identifier)
            if not await release_order(self._session, order, "admin", actor=data_user):
                raise _conflict(order, "cancel")
            if request.reason:
                await self._annotate_last_event(order, request.reason)
            self._audit.record(
                admin, "order.cancel", "order", number, {"reason": request.reason or None}
            )
            email = Email(
                to=order.contact_email,
                subject=f"{order.number} дугаартай захиалга цуцлагдлаа",
                body=f"{order.number} дугаартай захиалга цуцлагдсан бөгөөд "
                "танаас мөнгө авагдаагүй.",
            )
        log.info("order_cancelled_by_admin", order=number, admin_id=admin.id)
        await self._mailer.send(email)
        return await self._read(number)

    async def refund(self, number: str, admin: User, request: RefundRequest) -> AdminOrderOut:
        """Төлбөрийг бүтнээр нь буцаана. Provider-ийг transaction дотор, захиалгыг түгжсэн байхад
        дуудна: амжилтгүй бол юу ч өөрчлөгдөхгүй, idempotency key нь давтахыг аюулгүй болгоно."""
        if self._gateway is None:
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Төлбөр боломжгүй байна",
                "Төлбөрийн үйлчилгээ тохируулагдаагүй тул буцаан олгох боломжгүй.",
                type_=PAYMENTS_UNAVAILABLE_TYPE,
            )
        async with self._session.begin():
            order = await self._lock(number)
            self._require(order, ("paid", "shipped", "delivered"), "refund")
            payment = order.payment
            if payment is None or payment.status != "succeeded":
                raise _conflict(order, "refund")
            try:
                payment.refund_id = await self._gateway.refund(
                    payment.provider_payment_id,
                    idempotency_key=f"refund-{payment.provider_payment_id}",
                )
            except PaymentProviderError as exc:
                raise _provider_error(exc) from exc
            payment.status = "refunded"
            payment.provider_data = None
            payment.last_error = "admin_refund"
            if request.restock:
                await self._restock(order)
            order.status = "refunded"
            order.refunded_at = datetime.now(UTC)
            self._orders.add_event(
                order.id,
                "refunded",
                {
                    "reason": request.reason,
                    "restock": request.restock,
                    "amount_cents": payment.amount_cents,
                    **_by(admin),
                },
                admin.id,
            )
            self._audit.record(
                admin,
                "order.refund",
                "order",
                number,
                {
                    "reason": request.reason,
                    "restock": request.restock,
                    "amount_cents": payment.amount_cents,
                },
            )
            email = Email(
                to=order.contact_email,
                subject=f"{order.number} дугаартай захиалгын төлбөр буцаагдлаа",
                body=f"{order.number} дугаартай захиалгын {_money(order)}-ийг буцаан олголоо. "
                "Таны дансны хуулгад харагдахад хэдэн хоног шаардагдаж болно.",
            )
        log.info("order_refunded", order=number, admin_id=admin.id, restock=request.restock)
        await self._mailer.send(email)
        return await self._read(number)

    async def add_note(self, number: str, admin: User, request: NoteRequest) -> AdminOrderOut:
        """Аль ч захиалга дээрх дотоод тэмдэглэл. Хэрэглэгч хэзээ ч харахгүй."""
        async with self._session.begin():
            order_id = await self._orders.id_for_number(number)
            if order_id is None:
                raise _not_found(number)
            self._orders.add_event(order_id, "note", {"text": request.text, **_by(admin)}, admin.id)
            self._audit.record(admin, "order.note", "order", number)
        return await self._read(number)

    # --- туслах функцууд ---

    async def _lock(self, number: str) -> Order:
        order_id = await self._orders.id_for_number(number)
        order = await self._orders.get_for_update(order_id) if order_id is not None else None
        if order is None:
            raise _not_found(number)
        return order

    async def _lock_plain(self, number: str) -> Order:
        order = await self._orders.get_by_number(number)
        if order is None:
            raise _not_found(number)
        return order

    @staticmethod
    def _require(order: Order, allowed: tuple[str, ...], action: str) -> None:
        if order.status not in allowed:
            raise _conflict(order, action)

    async def _restock(self, order: Order) -> None:
        quantities: dict[int, int] = defaultdict(int)
        for item in order.items:
            quantities[item.product_id] += item.quantity
        # Checkout-той адил id-н дарааллаар түгжинэ, ингэвэл хоёр нь deadlock-д орохгүй.
        products = await ProductRepository(self._session).get_many(
            list(quantities), for_update=True
        )
        for product_id, quantity in quantities.items():
            products[product_id].stock_quantity += quantity

    async def _annotate_last_event(self, order: Order, note: str) -> None:
        await self._session.flush()
        self._orders.add_event(order.id, "note", {"text": f"Cancelled: {note}"})

    async def _read(self, number: str) -> AdminOrderOut:
        async with self._session.begin():
            order = await self._orders.get_by_number(number)
            if order is None:
                raise _not_found(number)
            return to_admin_order_out(order, self._storage)


def _by(admin: User) -> dict[str, object]:
    return {"actor": admin.identifier}


def _not_found(number: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.NOT_FOUND,
        "Захиалга олдсонгүй",
        f"{number} дугаартай захиалга байхгүй байна.",
        type_=ORDER_NOT_FOUND_TYPE,
    )


# Үйлдэл, төлөвийн монгол нэр (алдааны мэссэжид): `_require`-ийн `action` англи түлхүүр хэвээр.
_ACTIONS = {
    "ship": "илгээх",
    "mark as delivered": "хүргэгдсэн гэж тэмдэглэх",
    "cancel": "цуцлах",
    "refund": "буцаан олгох",
}
_STATUSES = {
    "pending": "хүлээгдэж буй",
    "paid": "төлөгдсөн",
    "shipped": "илгээсэн",
    "delivered": "хүргэгдсэн",
    "cancelled": "цуцлагдсан",
    "refunded": "буцаагдсан",
}


def _conflict(order: Order, action: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.CONFLICT,
        f"Захиалгыг {_ACTIONS.get(action, action)} боломжгүй",
        f'{order.number} дугаартай захиалгын төлөв "{_STATUSES.get(order.status, order.status)}" '
        "тул энэ үйлдэл хамаарахгүй.",
        type_=INVALID_TRANSITION_TYPE,
    )


def _provider_error(exc: Exception) -> ProblemError:
    log.warning("order_action_provider_error", error=str(exc))
    return ProblemError(
        HTTPStatus.BAD_GATEWAY,
        "Төлбөрийн үйлчилгээ хариу өгсөнгүй",
        "Юу ч өөрчлөгдөөгүй. Хэсэг хүлээгээд дахин оролдоно уу.",
        type_=PAYMENT_PROVIDER_TYPE,
    )
