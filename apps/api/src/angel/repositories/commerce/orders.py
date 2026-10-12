from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from angel.models import Order, OrderEvent, OrderItem, Payment, StripeEvent
from angel.repositories.patterns import contains_pattern, prefix_pattern

_WITH_DETAILS = (selectinload(Order.items), selectinload(Order.payment))
# Plus the history, for the pages that show it.
_WITH_EVENTS = (*_WITH_DETAILS, selectinload(Order.events))


class OrderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, order: Order, items: Sequence[OrderItem]) -> Order:
        self._session.add(order)
        await self._session.flush()
        for item in items:
            item.order_id = order.id
            self._session.add(item)
        await self._session.flush()
        return order

    async def get_by_idempotency_key(self, user_id: int, key: str) -> Order | None:
        result = await self._session.execute(
            select(Order)
            .where(Order.user_id == user_id, Order.idempotency_key == key)
            .options(*_WITH_DETAILS)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_for_user(self, user_id: int, number: str) -> Order | None:
        """Scoped to the owner: someone else's order number is indistinguishable from a typo."""
        result = await self._session.execute(
            select(Order)
            .where(Order.user_id == user_id, Order.number == number)
            .options(*_WITH_EVENTS)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, order_id: int) -> Order | None:
        result = await self._session.execute(
            select(Order)
            .where(Order.id == order_id)
            .options(*_WITH_DETAILS)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_for_update(self, order_id: int) -> Order | None:
        """Lock the order row; state changes are decided one at a time. Items and payment are
        loaded in separate queries (no lock) because FOR UPDATE and eager joins do not mix."""
        result = await self._session.execute(
            select(Order)
            .where(Order.id == order_id)
            .options(*_WITH_DETAILS)
            .with_for_update(of=Order)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: int, *, limit: int, offset: int) -> list[Order]:
        result = await self._session.execute(
            select(Order)
            .where(Order.user_id == user_id)
            .options(selectinload(Order.items))
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars())

    async def count_for_user(self, user_id: int) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(Order).where(Order.user_id == user_id)
        )
        return int(result.scalar_one())

    # --- admin: every customer's orders ------------------------------------------------------

    @staticmethod
    def _admin_clauses(text_query: str | None, status: str) -> list[ColumnElement[bool]]:
        clauses: list[ColumnElement[bool]] = []
        if text_query:
            clauses.append(
                or_(
                    Order.number.ilike(prefix_pattern(text_query), escape="\\"),
                    Order.contact_email.ilike(contains_pattern(text_query), escape="\\"),
                )
            )
        if status != "all":
            clauses.append(Order.status == status)
        return clauses

    async def list_all(
        self, *, text_query: str | None, status: str, limit: int, offset: int
    ) -> tuple[list[Order], int]:
        clauses = self._admin_clauses(text_query, status)
        total = (
            await self._session.execute(select(func.count()).select_from(Order).where(*clauses))
        ).scalar_one()
        rows = await self._session.execute(
            select(Order)
            .where(*clauses)
            .options(*_WITH_DETAILS)
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows.scalars()), int(total)

    async def get_by_number(self, number: str) -> Order | None:
        result = await self._session.execute(
            select(Order)
            .where(Order.number == number)
            .options(*_WITH_EVENTS)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def id_for_number(self, number: str) -> int | None:
        result = await self._session.execute(select(Order.id).where(Order.number == number))
        return result.scalar_one_or_none()

    async def status_counts(self, text_query: str | None) -> dict[str, int]:
        """Orders per status for the admin tabs (the search applies, the status filter does not)."""
        clauses = self._admin_clauses(text_query, "all")
        rows = await self._session.execute(
            select(Order.status, func.count()).where(*clauses).group_by(Order.status)
        )
        return {status: int(count) for status, count in rows.all()}

    def add_event(
        self,
        order_id: int,
        event_type: str,
        data: dict[str, object] | None = None,
        actor_id: int | None = None,
    ) -> None:
        """Part of the caller's transaction: the event exists exactly if the change does."""
        self._session.add(
            OrderEvent(order_id=order_id, type=event_type, data=data or {}, actor_id=actor_id)
        )

    async def pending_for_user(self, user_id: int) -> list[Order]:
        result = await self._session.execute(
            select(Order)
            .where(Order.user_id == user_id, Order.status == "pending")
            .options(selectinload(Order.payment))
            .order_by(Order.id)
        )
        return list(result.scalars())

    async def pending_older_than(self, cutoff: datetime, limit: int) -> list[Order]:
        result = await self._session.execute(
            select(Order)
            .where(Order.status == "pending", Order.created_at < cutoff)
            .options(selectinload(Order.payment))
            .order_by(Order.created_at)
            .limit(limit)
        )
        return list(result.scalars())

    async def add_payment_if_missing(self, payment: Payment) -> None:
        """A replayed checkout may race with the request that is already creating the payment:
        the unique `order_id` makes the second insert a no-op."""
        await self._session.execute(
            insert(Payment)
            .values(
                order_id=payment.order_id,
                provider=payment.provider,
                provider_payment_id=payment.provider_payment_id,
                client_secret=payment.client_secret,
                status=payment.status,
                amount_cents=payment.amount_cents,
                currency=payment.currency,
            )
            .on_conflict_do_nothing(index_elements=[Payment.order_id])
        )

    async def get_payment_by_provider_id(self, provider_payment_id: str) -> Payment | None:
        result = await self._session.execute(
            select(Payment).where(Payment.provider_payment_id == provider_payment_id)
        )
        return result.scalar_one_or_none()

    async def record_event(self, event_id: str, event_type: str) -> bool:
        """True the first time an event id is seen, False for every redelivery."""
        result = await self._session.execute(
            insert(StripeEvent)
            .values(id=event_id, type=event_type)
            .on_conflict_do_nothing()
            .returning(StripeEvent.id)
        )
        return result.scalar_one_or_none() is not None
