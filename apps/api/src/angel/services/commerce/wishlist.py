from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import PRODUCT_NOT_FOUND_TYPE, WISHLIST_FULL_TYPE, ProblemError
from angel.repositories.catalog.products import ProductRepository
from angel.repositories.commerce.wishlist import WishlistRepository
from angel.schemas.commerce.wishlist import WishlistOut
from angel.services.mappers import to_product_out
from angel.storage import Storage

MAX_WISHLIST_ITEMS = 200


class WishlistService:
    def __init__(self, session: AsyncSession, storage: Storage) -> None:
        self._session = session
        self._storage = storage
        self._wishlist = WishlistRepository(session)
        self._products = ProductRepository(session)

    async def list(self, user_id: int) -> WishlistOut:
        async with self._session.begin():
            ids = await self._wishlist.list_product_ids(user_id, MAX_WISHLIST_ITEMS)
            products = await self._products.get_many(ids)
        # Шинэ нь эхэнд; catalogue-оос татагдсан бараа жагсаалтаас чимээгүй гарна.
        return WishlistOut(
            items=[
                to_product_out(products[i], self._storage)
                for i in ids
                if i in products and products[i].is_active
            ]
        )

    async def add(self, user_id: int, product_id: int) -> None:
        """Idempotent: ижил барааг хоёр удаа хадгалах нь алдаа биш (давхар товшилт, retry)."""
        async with self._session.begin():
            product = (await self._products.get_many([product_id])).get(product_id)
            if product is None or not product.is_active:
                raise ProblemError(
                    HTTPStatus.NOT_FOUND,
                    "Product not found",
                    type_=PRODUCT_NOT_FOUND_TYPE,
                )
            if await self._wishlist.count(user_id) >= MAX_WISHLIST_ITEMS:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Your wishlist is full",
                    f"A wishlist holds at most {MAX_WISHLIST_ITEMS} products.",
                    type_=WISHLIST_FULL_TYPE,
                )
            await self._wishlist.add(user_id, product_id)

    async def remove(self, user_id: int, product_id: int) -> None:
        async with self._session.begin():
            await self._wishlist.remove(user_id, product_id)
