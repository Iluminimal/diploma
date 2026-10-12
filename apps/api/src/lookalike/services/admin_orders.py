import math
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.core.errors import ORDER_NOT_FOUND_TYPE, ProblemError
from lookalike.repositories.orders import OrderRepository
from lookalike.schemas.admin import (
    AdminOrderListQuery,
    AdminOrderOut,
    AdminOrderPage,
)
from lookalike.services.mappers import to_admin_order_out, to_admin_order_summary
from lookalike.storage import Storage


class AdminOrderService:
    """Read-only view of every customer's orders (changes are `OrderFulfillmentService`)."""

    def __init__(self, session: AsyncSession, storage: Storage) -> None:
        self._session = session
        self._storage = storage
        self._orders = OrderRepository(session)

    async def list(self, query: AdminOrderListQuery) -> AdminOrderPage:
        async with self._session.begin():
            rows, total = await self._orders.list_all(
                text_query=query.q,
                status=query.status,
                limit=query.page_size,
                offset=(query.page - 1) * query.page_size,
            )
            items = [to_admin_order_summary(order) for order in rows]
            counts = await self._orders.status_counts(query.q)
        return AdminOrderPage(
            items=items,
            status_counts=counts,
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
        )

    async def get(self, number: str) -> AdminOrderOut:
        async with self._session.begin():
            order = await self._orders.get_by_number(number)
            if order is None:
                raise ProblemError(
                    HTTPStatus.NOT_FOUND,
                    "Order not found",
                    f"There is no order {number}.",
                    type_=ORDER_NOT_FOUND_TYPE,
                )
            return to_admin_order_out(order, self._storage)
