"""What an administrator can do to an order, as one small state machine.

    pending --cancel--> cancelled
    pending --(payment)--> paid --ship--> shipped --deliver--> delivered
    paid | shipped | delivered --refund--> refunded

Every action takes the order's row lock (so two administrators, or an administrator and a webhook,
are decided one after the other), checks that the order is in a state the action applies to (409
otherwise), changes the order and writes an `OrderEvent` in the same transaction, and sends the
customer an email once it has been committed.
"""

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
from angel.models import Order, User
from angel.payments import PaymentGateway
from angel.payments.gateway import PaymentProviderError
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
    return f"{order.total_cents / 100:.2f} {order.currency}"


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

    # --- actions ------------------------------------------------------------------------------

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
            email = Email(
                to=order.contact_email,
                subject=f"Order {order.number} is on its way",
                body=f"Good news: order {order.number} has shipped with {request.carrier}.\n"
                f"Tracking number: {request.tracking_number}",
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
            email = Email(
                to=order.contact_email,
                subject=f"Order {order.number} was delivered",
                body=f"Order {order.number} has been delivered. We hope you love it!",
            )
        log.info("order_delivered", order=number, admin_id=admin.id)
        await self._mailer.send(email)
        return await self._read(number)

    async def cancel(self, number: str, admin: User, request: CancelRequest) -> AdminOrderOut:
        """Cancel an order that has not been paid: stock goes back, the payment intent is cancelled
        at the provider first (like the expiry sweeper does)."""
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
                    "The order was just paid",
                    "The payment went through a moment ago. Refresh the order to see it.",
                    type_=INVALID_TRANSITION_TYPE,
                )
        async with self._session.begin():
            order = await self._lock(number)
            data_user = (admin.id, admin.email)
            if not await release_order(self._session, order, "admin", actor=data_user):
                raise _conflict(order, "cancel")
            if request.reason:
                await self._annotate_last_event(order, request.reason)
            email = Email(
                to=order.contact_email,
                subject=f"Order {order.number} was cancelled",
                body=f"Order {order.number} has been cancelled and you were not charged.",
            )
        log.info("order_cancelled_by_admin", order=number, admin_id=admin.id)
        await self._mailer.send(email)
        return await self._read(number)

    async def refund(self, number: str, admin: User, request: RefundRequest) -> AdminOrderOut:
        """Return the whole payment. The provider is called inside the transaction, with the order
        locked: if it fails nothing changes, and the idempotency key makes a retry safe."""
        if self._gateway is None:
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Payments are not available",
                "No payment provider is configured, so nothing can be refunded.",
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
            payment.client_secret = None
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
            email = Email(
                to=order.contact_email,
                subject=f"Order {order.number} was refunded",
                body=f"We refunded {_money(order)} for order {order.number}. "
                "It can take a few days to appear on your statement.",
            )
        log.info("order_refunded", order=number, admin_id=admin.id, restock=request.restock)
        await self._mailer.send(email)
        return await self._read(number)

    async def add_note(self, number: str, admin: User, request: NoteRequest) -> AdminOrderOut:
        """An internal remark on any order. Customers never see it."""
        async with self._session.begin():
            order_id = await self._orders.id_for_number(number)
            if order_id is None:
                raise _not_found(number)
            self._orders.add_event(order_id, "note", {"text": request.text, **_by(admin)}, admin.id)
        return await self._read(number)

    # --- helpers ------------------------------------------------------------------------------

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
        # Locked in id order, like checkout, so the two cannot deadlock.
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
    return {"actor": admin.email}


def _not_found(number: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.NOT_FOUND,
        "Order not found",
        f"There is no order {number}.",
        type_=ORDER_NOT_FOUND_TYPE,
    )


def _conflict(order: Order, action: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.CONFLICT,
        f"Cannot {action} this order",
        f"Order {order.number} is {order.status}, which this action does not apply to.",
        type_=INVALID_TRANSITION_TYPE,
    )


def _provider_error(exc: Exception) -> ProblemError:
    log.warning("order_action_provider_error", error=str(exc))
    return ProblemError(
        HTTPStatus.BAD_GATEWAY,
        "The payment provider did not answer",
        "Nothing was changed. Try again in a moment.",
        type_=PAYMENT_PROVIDER_TYPE,
    )
