from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from angel.models import WishlistItem


class WishlistRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_product_ids(self, user_id: int, limit: int) -> list[int]:
        result = await self._session.execute(
            select(WishlistItem.product_id)
            .where(WishlistItem.user_id == user_id)
            .order_by(WishlistItem.id.desc())
            .limit(limit)
        )
        return list(result.scalars())

    async def count(self, user_id: int) -> int:
        result = await self._session.execute(
            select(func.count()).select_from(WishlistItem).where(WishlistItem.user_id == user_id)
        )
        return int(result.scalar_one())

    async def add(self, user_id: int, product_id: int) -> None:
        await self._session.execute(
            insert(WishlistItem)
            .values(user_id=user_id, product_id=product_id)
            .on_conflict_do_nothing()
        )

    async def remove(self, user_id: int, product_id: int) -> None:
        await self._session.execute(
            delete(WishlistItem).where(
                WishlistItem.user_id == user_id, WishlistItem.product_id == product_id
            )
        )
