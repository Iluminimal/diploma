from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from lookalike.models import Cart, CartItem


class CartRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find(
        self, *, user_id: int | None = None, guest_token_hash: str | None = None
    ) -> Cart | None:
        if user_id is not None:
            condition = Cart.user_id == user_id
        else:
            condition = Cart.guest_token_hash == guest_token_hash
        result = await self._session.execute(
            select(Cart)
            .where(condition)
            .options(selectinload(Cart.items))
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_or_create(
        self, *, user_id: int | None = None, guest_token_hash: str | None = None
    ) -> Cart:
        cart = await self.find(user_id=user_id, guest_token_hash=guest_token_hash)
        if cart is not None:
            return cart
        # Two requests creating the same user's cart at once: the loser's insert is a no-op.
        await self._session.execute(
            insert(Cart)
            .values(user_id=user_id, guest_token_hash=guest_token_hash)
            .on_conflict_do_nothing()
        )
        cart = await self.find(user_id=user_id, guest_token_hash=guest_token_hash)
        assert cart is not None
        return cart

    async def find_item(self, cart_id: int, item_id: int) -> CartItem | None:
        result = await self._session.execute(
            select(CartItem).where(CartItem.id == item_id, CartItem.cart_id == cart_id)
        )
        return result.scalar_one_or_none()

    async def add_quantity(
        self, *, cart_id: int, product_id: int, size: str, quantity: int, cap: int
    ) -> None:
        """Atomic add-or-increase: concurrent "add to cart" taps cannot create duplicate lines
        or lose an increment, and the line never exceeds `cap`."""
        statement = insert(CartItem).values(
            cart_id=cart_id, product_id=product_id, size=size, quantity=min(quantity, cap)
        )
        await self._session.execute(
            statement.on_conflict_do_update(
                index_elements=[CartItem.cart_id, CartItem.product_id, CartItem.size],
                set_={
                    "quantity": func.least(CartItem.quantity + statement.excluded.quantity, cap),
                    "updated_at": func.now(),
                },
            )
        )

    async def delete_item(self, item: CartItem) -> None:
        await self._session.delete(item)
        await self._session.flush()

    async def clear(self, cart_id: int) -> None:
        await self._session.execute(delete(CartItem).where(CartItem.cart_id == cart_id))

    async def remove_lines(self, cart_id: int, lines: set[tuple[int, str]]) -> None:
        for product_id, size in lines:
            await self._session.execute(
                delete(CartItem).where(
                    CartItem.cart_id == cart_id,
                    CartItem.product_id == product_id,
                    CartItem.size == size,
                )
            )

    async def delete_cart(self, cart: Cart) -> None:
        await self._session.execute(delete(Cart).where(Cart.id == cart.id))

    async def touch(self, cart_id: int) -> None:
        await self._session.execute(
            update(Cart).where(Cart.id == cart_id).values(updated_at=func.now())
        )

    async def delete_stale_guest_carts(self, older_than: datetime) -> int:
        result = await self._session.execute(
            delete(Cart).where(Cart.user_id.is_(None), Cart.updated_at < older_than)
        )
        return int(result.rowcount or 0)  # type: ignore[attr-defined]
