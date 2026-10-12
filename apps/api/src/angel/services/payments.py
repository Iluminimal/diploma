"""Settling payments: the one place that turns a provider event into an order state change.

Called by the Stripe webhook and, in offline mode, by the simulate endpoint, so the code that
runs in development is the code that runs in production.
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.models import Order, Payment
from angel.payments import PaymentEvent, PaymentGateway
from angel.repositories.carts import CartRepository
from angel.repositories.orders import OrderRepository
from angel.services.order_lifecycle import release_order

log = get_logger(__name__)


class PaymentSettlement:
    def __init__(
        self, session: AsyncSession, gateway: PaymentGateway, settings: Settings, mailer: Mailer
    ) -> None:
        self._session = session
        self._gateway = gateway
        self._settings = settings
        self._mailer = mailer
        self._orders = OrderRepository(session)

    async def handle(self, event: PaymentEvent) -> None:
        """Apply one event exactly once.

        The event id is stored in the same transaction as the state change: a crash rolls both
        back and the provider redelivers, a redelivery after success finds the id and does
        nothing. Handlers are also written to be harmless when events arrive late or out of order.
        """
        confirmation: Email | None = None
        async with self._session.begin():
            if not await self._orders.record_event(event.id, event.kind):
                log.info("payment_event_duplicate", event_id=event.id)
                return
            payment = await self._orders.get_payment_by_provider_id(event.intent_id)
            if payment is None:  # not ours (another integration on the same Stripe account)
                log.info("payment_event_unknown_intent", event_id=event.id)
                return
            order = await self._orders.get_for_update(payment.order_id)
            if order is None:
                return
            if event.kind == "succeeded":
                confirmation = await self._on_succeeded(order, payment, event)
            elif event.kind == "failed":
                self._on_failed(payment, event)
            else:
                await self._on_canceled(order, payment)
        if confirmation is not None:
            await self._mailer.send(confirmation)

    async def _on_succeeded(
        self, order: Order, payment: Payment, event: PaymentEvent
    ) -> Email | None:
        if payment.status in ("succeeded", "refunded"):
            return None
        if order.status == "cancelled":
            # Paid after we gave the stock back (expired, or replaced by a newer checkout). The
            # goods may be gone, so the money goes back instead.
            await self._refund(payment, reason="order_cancelled")
            self._orders.add_event(
                order.id, "refunded", {"reason": "order_cancelled", "automatic": True}
            )
            log.warning("payment_after_cancel_refunded", order=order.number)
            return None
        if event.amount_cents != order.total_cents or event.currency != order.currency:
            log.error("payment_amount_mismatch", order=order.number, paid=event.amount_cents)
            await self._refund(payment, reason="amount_mismatch")
            await release_order(self._session, order, "amount_mismatch")
            self._orders.add_event(
                order.id, "refunded", {"reason": "amount_mismatch", "automatic": True}
            )
            return None
        order.status = "paid"
        order.paid_at = datetime.now(UTC)
        payment.status = "succeeded"
        payment.client_secret = None
        payment.last_error = None
        self._orders.add_event(order.id, "paid", {"amount_cents": payment.amount_cents})
        carts = CartRepository(self._session)
        cart = await carts.find(user_id=order.user_id)
        if cart is not None:  # the bought lines leave the cart; anything added since stays
            await carts.remove_lines(cart.id, {(i.product_id, i.size) for i in order.items})
        await self._session.flush()
        return Email(
            to=order.contact_email,
            subject=f"Order {order.number} confirmed",
            body=f"Thank you! We received your payment of {order.total_cents / 100:.2f} "
            f"{order.currency} for order {order.number}.",
        )

    @staticmethod
    def _on_failed(payment: Payment, event: PaymentEvent) -> None:
        # The order stays pending: the shopper can try another card on the same PaymentIntent
        # until the order expires. A failure that arrives after success is ignored.
        if payment.status == "requires_payment":
            payment.status = "failed"
        if payment.status == "failed":
            payment.last_error = (event.message or "Payment failed")[:300]

    async def _on_canceled(self, order: Order, payment: Payment) -> None:
        if payment.status in ("succeeded", "refunded"):
            return
        await release_order(self._session, order, "payment_canceled")

    async def _refund(self, payment: Payment, *, reason: str) -> None:
        """Called inside the transaction on purpose: if the refund call fails, the event is not
        recorded and the provider will deliver it again. The idempotency key makes a repeat safe."""
        payment.refund_id = await self._gateway.refund(
            payment.provider_payment_id, idempotency_key=f"refund-{payment.provider_payment_id}"
        )
        payment.status = "refunded"
        payment.client_secret = None
        payment.last_error = reason
