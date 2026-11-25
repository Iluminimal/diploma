"""Төлбөр шийдвэрлэх: provider-ийн баталгаажсан төлбөрийг захиалгын төлвийн өөрчлөлт болгодог
цорын ганц газар.

QPay-ийн мэдэгдэл, худалдан авагчийн "Төлбөрөө шалгах", offline горимын simulate endpoint бүгд
үүнийг дуудна, тиймээс development-д ажилладаг код production-д ажилладаг код байна."""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.core.money import format_minor
from angel.models import Order, Payment
from angel.payments import PaymentEvent, PaymentGateway
from angel.repositories.commerce.carts import CartRepository
from angel.repositories.commerce.orders import OrderRepository
from angel.services.commerce.order_lifecycle import release_order
from angel.services.commerce.order_text import confirmation_body

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
        """Нэг баталгаажсан төлбөрийг яг нэг удаа хэрэглэнэ.

        Event id төлвийн өөрчлөлттэй нэг transaction-д хадгалагдана: crash хоёуланг rollback
        хийж дараагийн шалгалт дахин хэрэглэнэ, амжилтын дараах давталт id-г олж юу ч хийхгүй.
        Төлбөр хожимдож (захиалга цуцлагдсаны дараа) ирсэн ч хор хөнөөлгүй."""
        confirmation: Email | None = None
        async with self._session.begin():
            if not await self._orders.record_event(event.id, event.kind):
                log.info("payment_event_duplicate", event_id=event.id)
                return
            payment = await self._orders.get_payment_by_provider_id(event.intent_id)
            if payment is None:  # бидний биш
                log.info("payment_event_unknown_intent", event_id=event.id)
                return
            order = await self._orders.get_for_update(payment.order_id)
            if order is None:
                return
            confirmation = await self._on_succeeded(order, payment, event)
        if confirmation is not None:
            await self._mailer.send(confirmation)

    async def _on_succeeded(
        self, order: Order, payment: Payment, event: PaymentEvent
    ) -> Email | None:
        if payment.status in ("succeeded", "refunded"):
            return None
        if order.status == "cancelled":
            # Нөөцийг буцаасны дараа төлөгдсөн (дууссан, эсвэл шинэ checkout-оор солигдсон). Бараа
            # алга болсон байж болох тул оронд нь мөнгийг буцаана.
            await self._refund(payment, reason="order_cancelled")
            self._orders.add_event(
                order.id, "refunded", {"reason": "order_cancelled", "automatic": True}
            )
            log.warning("payment_after_cancel_refunded", order=order.number)
            return None
        # Түгжсэн дүнтэй харьцуулна (QPay: төгрөг), захиалгын USD дүнтэй биш.
        if event.amount != payment.charge_minor or event.currency != payment.charge_currency:
            log.error(
                "payment_amount_mismatch",
                order=order.number,
                paid=event.amount,
                currency=event.currency,
                expected=payment.charge_minor,
            )
            await self._refund(payment, reason="amount_mismatch")
            await release_order(self._session, order, "amount_mismatch")
            self._orders.add_event(
                order.id, "refunded", {"reason": "amount_mismatch", "automatic": True}
            )
            return None
        order.status = "paid"
        order.paid_at = datetime.now(UTC)
        payment.status = "succeeded"
        payment.provider_data = None
        payment.last_error = None
        self._orders.add_event(order.id, "paid", {"amount_cents": payment.amount_cents})
        carts = CartRepository(self._session)
        cart = await carts.find(user_id=order.user_id)
        if cart is not None:  # худалдаж авсан мөрүүд cart-аас гарна; түүнээс хойш нэмсэн нь үлдэнэ
            await carts.remove_lines(cart.id, {(i.product_id, i.size) for i in order.items})
        await self._session.flush()
        return Email(
            to=order.contact_email,
            subject=f"{order.number} дугаартай захиалга баталгаажлаа",
            body=confirmation_body(
                order, format_minor(payment.charge_minor, payment.charge_currency)
            ),
        )

    async def _refund(self, payment: Payment, *, reason: str) -> None:
        """Зориудаар transaction дотор дуудна: refund дуудлага амжилтгүй бол event бүртгэгдэхгүй,
        provider дахин хүргэнэ. Idempotency key нь давтахыг аюулгүй болгоно."""
        payment.refund_id = await self._gateway.refund(
            payment.provider_payment_id, idempotency_key=f"refund-{payment.provider_payment_id}"
        )
        payment.status = "refunded"
        payment.provider_data = None
        payment.last_error = reason
