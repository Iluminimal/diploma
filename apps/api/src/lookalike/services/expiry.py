"""Housekeeping that runs in the background: unpaid orders give their stock back, and abandoned
guest carts are deleted. Safe to run in several API processes at once: every order is decided
under its row lock and only if it is still pending, and cancelling a payment twice is harmless."""

import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from lookalike.core.config import Settings
from lookalike.core.logging import get_logger
from lookalike.payments import PaymentGateway, PaymentProviderError
from lookalike.repositories.carts import CartRepository
from lookalike.repositories.orders import OrderRepository
from lookalike.services.order_lifecycle import release_order

log = get_logger(__name__)

BATCH = 50


class OrderExpirer:
    def __init__(
        self,
        sessions: async_sessionmaker[AsyncSession],
        gateway: PaymentGateway | None,
        settings: Settings,
    ) -> None:
        self._sessions = sessions
        self._gateway = gateway
        self._settings = settings

    async def run_once(self) -> int:
        """Expire pending orders older than the TTL. Returns how many were released."""
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
                return False  # try again on the next sweep
            if outcome == "succeeded":
                return False  # paid after all: the webhook settles it
        async with self._sessions() as session, session.begin():
            order = await OrderRepository(session).get_for_update(order_id)
            if order is None:
                return False
            released = await release_order(session, order, "expired")
        if released:
            log.info("order_expired", order_id=order_id)
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
