import math
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.core.errors import ORDER_NOT_FOUND_TYPE, ProblemError
from lookalike.repositories.orders import OrderRepository
from lookalike.schemas.order import OrderOut, OrderPage
from lookalike.services.mappers import to_order_out, to_order_summary
from lookalike.storage import Storage


class OrderService:
    def __init__(self, session: AsyncSession, storage: Storage) -> None:
        self._session = session
        self._storage = storage
        self._orders = OrderRepository(session)

    async def list(self, user_id: int, *, page: int, page_size: int) -> OrderPage:
        async with self._session.begin():
            total = await self._orders.count_for_user(user_id)
            rows = await self._orders.list_for_user(
                user_id, limit=page_size, offset=(page - 1) * page_size
            )
            items = [to_order_summary(order, self._storage) for order in rows]
        return OrderPage(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size),
        )

    async def get(self, user_id: int, number: str) -> OrderOut:
        async with self._session.begin():
            order = await self._orders.get_for_user(user_id, number)
            if order is None:
                # Also what someone else's order number gets: no way to probe for existence.
                raise ProblemError(
                    HTTPStatus.NOT_FOUND,
                    "Order not found",
                    f"No order {number} on your account.",
                    type_=ORDER_NOT_FOUND_TYPE,
                )
            return to_order_out(order, self._storage)
