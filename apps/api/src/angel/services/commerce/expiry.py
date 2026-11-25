"""Дэвсгэрт ажилладаг цэвэрлэгээ: төлөгдөөгүй захиалга нөөцөө буцаана, орхигдсон зочны cart
устана. Хэд хэдэн API process зэрэг ажиллуулахад аюулгүй: захиалга бүрийг мөрийн түгжээн дор,
зөвхөн pending хэвээр байвал шийднэ, төлбөрийг хоёр удаа цуцлах нь хор хөнөөлгүй."""

import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from angel.core.config import Settings
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.payments import PaymentGateway, PaymentProviderError
from angel.repositories.commerce.carts import CartRepository
from angel.repositories.commerce.orders import OrderRepository
from angel.services.commerce.order_lifecycle import release_order
from angel.services.commerce.order_text import expired_body

log = get_logger(__name__)

BATCH = 50


class OrderExpirer:
    def __init__(
        self,
        sessions: async_sessionmaker[AsyncSession],
        gateway: PaymentGateway | None,
        settings: Settings,
        mailer: Mailer | None = None,
    ) -> None:
        self._mailer = mailer
        self._sessions = sessions
        self._gateway = gateway
        self._settings = settings

    async def run_once(self) -> int:
        """TTL-ээс хуучин pending захиалгыг дуусгана. Хэдийг чөлөөлсөнийг буцаана."""
        cutoff = datetime.now(UTC) - timedelta(minutes=self._settings.order_pending_ttl_minutes)
        async with self._sessions() as session, session.begin():
            candidates = [
                (order.id, order.payment.provider_payment_id if order.payment else None)
                for order in await OrderRepository(session).pending_older_than(cutoff, BATCH)
            ]
        released = 0
        for order_id, intent_id in candidates:
            if await self._expire(order_id, intent_id):
                released += 1
        async with self._sessions() as session, session.begin():
            guest_cutoff = datetime.now(UTC) - timedelta(days=self._settings.cart_guest_ttl_days)
            await CartRepository(session).delete_stale_guest_carts(guest_cutoff)
        return released

    async def _expire(self, order_id: int, intent_id: str | None) -> bool:
        if intent_id is not None:
            if self._gateway is None:
                return False
            try:
                outcome = await self._gateway.cancel_intent(intent_id)
            except PaymentProviderError as exc:
                log.warning("order_expiry_deferred", order_id=order_id, error=str(exc))
                return False  # дараагийн sweep дээр дахин оролдоно
            if outcome == "succeeded":
                return False  # эцэстээ төлөгдсөн: webhook үүнийг шийднэ
        async with self._sessions() as session, session.begin():
            order = await OrderRepository(session).get_for_update(order_id)
            if order is None:
                return False
            released = await release_order(session, order, "expired")
            email = (
                Email(
                    to=order.contact_email,
                    subject=f"{order.number} дугаартай захиалгын хугацаа дууслаа",
                    body=expired_body(order),
                )
                if released
                else None
            )
        if released:
            log.info("order_expired", order_id=order_id)
            if email is not None and self._mailer is not None:
                await self._mailer.send(email)
        return released

    async def run_forever(self) -> None:
        while True:
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("order_expiry_failed")
            await asyncio.sleep(self._settings.order_sweep_interval_seconds)
