"""Admin dashboard болон хэрэглэгчийн жагсаалтын зөвхөн унших aggregate-ууд. Шинэ хүснэгт
байхгүй: бүгд захиалга, захиалгын мөр, бараа, хэрэглэгчийн дээрх sum, count."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from angel.models import Order, OrderItem, Product, User
from angel.repositories.patterns import contains_pattern

# Баталгаатай орлого: төлөгдсөн, буцаагдаагүй. Төлөгдсөн өдрөөр бүлэглэнэ.
REVENUE_STATUSES = ("paid", "shipped", "delivered")
# Худалдан авсан захиалгууд (буцаан олголттой захиалга ч худалдан авсанд тооцогдоно).
BOUGHT_STATUSES = (*REVENUE_STATUSES, "refunded")
DELETED_EMAIL = "%@deleted.invalid"
# Зөвхөн утасны бүртгэлд email байхгүй: NOT LIKE ганцаараа NULL өгч, тэднийг хасчихна.
_NOT_DELETED = or_(User.email.is_(None), User.email.not_like(DELETED_EMAIL))


def _paid_between(start: datetime, end: datetime) -> list[ColumnElement[bool]]:
    return [Order.status.in_(REVENUE_STATUSES), Order.paid_at >= start, Order.paid_at < end]


class DashboardRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def revenue_and_orders(self, start: datetime, end: datetime) -> tuple[int, int]:
        row = (
            await self._session.execute(
                select(func.coalesce(func.sum(Order.total_cents), 0), func.count()).where(
                    *_paid_between(start, end)
                )
            )
        ).one()
        return int(row[0]), int(row[1])

    async def units(self, start: datetime, end: datetime) -> int:
        result = await self._session.execute(
            select(func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(Order, Order.id == OrderItem.order_id)
            .where(*_paid_between(start, end))
        )
        return int(result.scalar_one())

    async def new_customers(self, start: datetime, end: datetime) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(User)
            .where(
                User.role == "customer",
                _NOT_DELETED,
                User.created_at >= start,
                User.created_at < end,
            )
        )
        return int(result.scalar_one())

    async def daily(self, start: datetime, end: datetime) -> dict[date, tuple[int, int]]:
        day = func.date_trunc("day", func.timezone("UTC", Order.paid_at))
        rows = await self._session.execute(
            select(day, func.sum(Order.total_cents), func.count())
            .where(*_paid_between(start, end))
            .group_by(day)
        )
        return {row[0].date(): (int(row[1]), int(row[2])) for row in rows.all()}

    async def status_counts(self) -> dict[str, int]:
        rows = await self._session.execute(
            select(Order.status, func.count()).group_by(Order.status)
        )
        return {status: int(count) for status, count in rows.all()}

    async def top_products(
        self, start: datetime, end: datetime, limit: int
    ) -> list[tuple[int, str, str, str, int, int]]:
        revenue = func.sum(OrderItem.unit_price_cents * OrderItem.quantity)
        rows = await self._session.execute(
            select(
                OrderItem.product_id,
                func.max(OrderItem.product_name),
                func.max(OrderItem.product_slug),
                func.max(OrderItem.image_key),
                func.sum(OrderItem.quantity),
                revenue,
            )
            .join(Order, Order.id == OrderItem.order_id)
            .where(*_paid_between(start, end))
            .group_by(OrderItem.product_id)
            .order_by(revenue.desc(), OrderItem.product_id)
            .limit(limit)
        )
        return [(r[0], r[1], r[2], r[3], int(r[4]), int(r[5])) for r in rows.all()]

    async def low_stock(self, threshold: int, limit: int) -> tuple[list[Product], int, int]:
        """Нөөц нь багассан (гэхдээ дуусаагүй) зарагдаж буй бараа, тэдгээрийн тоо, мөн нөөц нь
        бүр дууссан барааны тоо."""
        on_sale = Product.is_active.is_(True)
        low = Product.stock_quantity.between(1, threshold)
        products = await self._session.execute(
            select(Product)
            .where(on_sale, low)
            .order_by(Product.stock_quantity, Product.id)
            .limit(limit)
        )
        low_total = (
            await self._session.execute(
                select(func.count()).select_from(Product).where(on_sale, low)
            )
        ).scalar_one()
        out_total = (
            await self._session.execute(
                select(func.count())
                .select_from(Product)
                .where(on_sale, Product.stock_quantity == 0)
            )
        ).scalar_one()
        return list(products.scalars()), int(low_total), int(out_total)

    # --- хэрэглэгчид ---

    def _customers(self) -> Select[Any]:
        agg = (
            select(
                Order.user_id.label("uid"),
                func.count().filter(Order.status.in_(BOUGHT_STATUSES)).label("orders"),
                func.coalesce(
                    func.sum(Order.total_cents).filter(Order.status.in_(REVENUE_STATUSES)), 0
                ).label("spent"),
                func.max(Order.created_at).label("last_order"),
            )
            .group_by(Order.user_id)
            .subquery()
        )
        return (
            select(
                User,
                func.coalesce(agg.c.orders, 0).label("orders"),
                func.coalesce(agg.c.spent, 0).label("spent"),
                agg.c.last_order.label("last_order"),
            )
            .outerjoin(agg, agg.c.uid == User.id)
            .where(User.role == "customer", _NOT_DELETED)
        )

    async def list_customers(
        self, *, text_query: str | None, status: str, sort: str, limit: int, offset: int
    ) -> tuple[list[tuple[User, int, int, datetime | None]], int]:
        statement = self._customers()
        clauses: list[ColumnElement[bool]] = []
        if text_query:
            pattern = contains_pattern(text_query)
            clauses.append(
                or_(
                    User.email.ilike(pattern, escape="\\"),
                    User.phone.ilike(pattern, escape="\\"),
                    User.full_name.ilike(pattern, escape="\\"),
                )
            )
        if status != "all":
            clauses.append(User.is_active.is_(status == "active"))
        statement = statement.where(*clauses)
        total = (
            await self._session.execute(select(func.count()).select_from(statement.subquery()))
        ).scalar_one()
        order = {
            "newest": (User.created_at.desc(), User.id.desc()),
            "spent": (func.coalesce(statement.selected_columns.spent, 0).desc(), User.id),
            "orders": (statement.selected_columns.orders.desc(), User.id),
            "name": (func.lower(User.full_name), User.id),
        }[sort]
        rows = await self._session.execute(statement.order_by(*order).limit(limit).offset(offset))
        return [(r[0], int(r[1]), int(r[2]), r[3]) for r in rows.all()], int(total)

    async def get_customer(self, user_id: int) -> tuple[User, int, int, datetime | None] | None:
        row = (
            await self._session.execute(self._customers().where(User.id == user_id))
        ).one_or_none()
        return (row[0], int(row[1]), int(row[2]), row[3]) if row else None

    async def orders_of(self, user_id: int, limit: int) -> list[Order]:
        result = await self._session.execute(
            select(Order)
            .where(Order.user_id == user_id)
            .options(selectinload(Order.items), selectinload(Order.payment))
            .order_by(Order.created_at.desc(), Order.id.desc())
            .limit(limit)
        )
        return list(result.scalars())
