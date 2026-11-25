"""Агуулахын самбарын зөвхөн унших aggregate-ууд (захиалга, бараа дээрх count, avg)."""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from angel.models import Order, Product
from angel.models.audit import StaffAuditLog


class FulfillmentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def paid_summary(self, overdue_before: datetime) -> tuple[int, int, datetime | None]:
        """Илгээхийг хүлээж буй захиалгын тоо, хоцорсон тоо, хамгийн эртний төлөгдсөн цаг."""
        row = (
            await self._session.execute(
                select(
                    func.count(),
                    func.count().filter(Order.paid_at < overdue_before),
                    func.min(Order.paid_at),
                ).where(Order.status == "paid")
            )
        ).one()
        return int(row[0]), int(row[1]), row[2]

    async def queue(self, limit: int) -> list[Order]:
        rows = await self._session.execute(
            select(Order)
            .where(Order.status == "paid")
            .options(selectinload(Order.items))
            .order_by(Order.paid_at.asc(), Order.id.asc())
            .limit(limit)
        )
        return list(rows.scalars())

    async def count_since(self, column: str, since: datetime) -> int:
        """`shipped_at` эсвэл `delivered_at` нь `since`-ээс хойш болсон захиалгын тоо."""
        field = {"shipped_at": Order.shipped_at, "delivered_at": Order.delivered_at}[column]
        result = await self._session.execute(
            select(func.count()).select_from(Order).where(field >= since)
        )
        return int(result.scalar_one())

    async def average_ship_hours(self, since: datetime) -> float | None:
        seconds = (
            await self._session.execute(
                select(func.avg(func.extract("epoch", Order.shipped_at - Order.paid_at))).where(
                    Order.shipped_at >= since, Order.paid_at.is_not(None)
                )
            )
        ).scalar_one()
        return None if seconds is None else round(float(seconds) / 3600, 1)

    async def stock_alerts(self, threshold: int, limit: int) -> tuple[list[Product], int, int]:
        """Нөөц нь дууссан эсвэл `threshold` ба түүнээс доош байгаа зарагдаж буй бараа (багаас
        нь), мөн дууссан, багассан барааны тоо."""
        on_sale = Product.is_active.is_(True)
        products = await self._session.execute(
            select(Product)
            .where(on_sale, Product.stock_quantity <= threshold)
            .order_by(Product.stock_quantity, Product.id)
            .limit(limit)
        )
        out = (
            await self._session.execute(
                select(func.count())
                .select_from(Product)
                .where(on_sale, Product.stock_quantity == 0)
            )
        ).scalar_one()
        low = (
            await self._session.execute(
                select(func.count())
                .select_from(Product)
                .where(on_sale, Product.stock_quantity.between(1, threshold))
            )
        ).scalar_one()
        return list(products.scalars()), int(out), int(low)

    async def activity_of(self, actor_id: int, limit: int) -> list[StaffAuditLog]:
        rows = await self._session.execute(
            select(StaffAuditLog)
            .where(StaffAuditLog.actor_id == actor_id)
            .order_by(StaffAuditLog.created_at.desc(), StaffAuditLog.id.desc())
            .limit(limit)
        )
        return list(rows.scalars())
