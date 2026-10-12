from dataclasses import dataclass
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    CART_FULL_TYPE,
    CART_ITEM_NOT_FOUND_TYPE,
    INSUFFICIENT_STOCK_TYPE,
    INVALID_SIZE_TYPE,
    PRODUCT_NOT_FOUND_TYPE,
    ProblemError,
)
from angel.core.security import hash_token
from angel.models import Cart, CartItem, Product
from angel.repositories.carts import CartRepository
from angel.repositories.products import ProductRepository
from angel.schemas.cart import CartIssue, CartItemIn, CartLineOut, CartOut
from angel.services.mappers import to_product_out
from angel.services.sizes import sizes_for
from angel.storage import Storage


@dataclass(frozen=True)
class CartOwner:
    """Whose cart a request is about: a signed-in user, or a guest identified by the raw value
    of the `lk_cart` cookie (only its hash is stored)."""

    user_id: int | None = None
    guest_token: str | None = None


def sellable_quantity(product: Product | None, max_per_line: int) -> int:
    """How many of a product can be bought right now: stock, bounded by the per-line limit."""
    if product is None or not product.is_active:
        return 0
    return max(0, min(product.stock_quantity, max_per_line))


def validate_size(product: Product, size: str) -> None:
    sizes = sizes_for(product)
    if sizes and size not in sizes:
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Choose a size",
            f"Available sizes: {', '.join(sizes)}.",
            type_=INVALID_SIZE_TYPE,
            extensions={"sizes": list(sizes)},
        )
    if not sizes and size:
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "This product has no sizes",
            type_=INVALID_SIZE_TYPE,
            extensions={"sizes": []},
        )


def build_cart(
    cart: Cart | None, products: dict[int, Product], storage: Storage, settings: Settings
) -> CartOut:
    lines: list[CartLineOut] = []
    for item in cart.items if cart else []:
        product = products.get(item.product_id)
        if product is None:  # cannot happen (FK), but a cart must never fail to render
            continue
        ceiling = sellable_quantity(product, settings.cart_max_quantity)
        issue: CartIssue | None = None
        if ceiling == 0:
            issue = "out_of_stock"
        elif item.quantity > ceiling:
            issue = "low_stock"
        lines.append(
            CartLineOut(
                id=item.id,
                product=to_product_out(product, storage),
                size=item.size,
                quantity=item.quantity,
                unit_price_cents=product.price_cents,
                line_total_cents=product.price_cents * item.quantity,
                max_quantity=ceiling,
                issue=issue,
            )
        )
    return CartOut(
        lines=lines,
        item_count=sum(line.quantity for line in lines),
        subtotal_cents=sum(line.line_total_cents for line in lines),
        currency=settings.currency,
        has_issues=any(line.issue for line in lines),
    )


async def merge_guest_cart(
    carts: CartRepository,
    products: ProductRepository,
    *,
    user_id: int,
    guest_token: str | None,
    max_per_line: int,
) -> None:
    """Fold the guest's cart into the user's, then delete it. Runs inside the caller's
    transaction (login and registration), so a failed login never half-merges a cart.

    The same product and size adds up, but never beyond the stock or the per-line limit. A line
    that is already over a limit (stock dropped since) is kept as it is, not silently reduced:
    the cart shows the problem and the shopper decides."""
    if not guest_token:
        return
    guest = await carts.find(guest_token_hash=hash_token(guest_token))
    if guest is None:
        return
    user_cart = await carts.get_or_create(user_id=user_id)
    stock = await products.get_many([item.product_id for item in guest.items])
    current = {(item.product_id, item.size): item.quantity for item in user_cart.items}
    for item in guest.items:
        # A sold-out line is still carried over (quantity 1): the cart flags it.
        ceiling = max(1, sellable_quantity(stock.get(item.product_id), max_per_line))
        already = current.get((item.product_id, item.size), 0)
        merged = max(already, min(already + item.quantity, ceiling))
        if merged > already:
            await carts.add_quantity(
                cart_id=user_cart.id,
                product_id=item.product_id,
                size=item.size,
                quantity=merged - already,
                cap=max(ceiling, already),
            )
    await carts.delete_cart(guest)


class CartService:
    def __init__(self, session: AsyncSession, storage: Storage, settings: Settings) -> None:
        self._session = session
        self._storage = storage
        self._settings = settings
        self._carts = CartRepository(session)
        self._products = ProductRepository(session)

    async def get(self, owner: CartOwner) -> CartOut:
        async with self._session.begin():
            return await self._render(await self._find(owner))

    async def add_item(self, owner: CartOwner, request: CartItemIn) -> CartOut:
        limit = self._settings.cart_max_quantity
        async with self._session.begin():
            product = (await self._products.get_many([request.product_id])).get(request.product_id)
            if product is None or not product.is_active:
                raise ProblemError(
                    HTTPStatus.NOT_FOUND,
                    "Product not found",
                    f"No product with id {request.product_id}.",
                    type_=PRODUCT_NOT_FOUND_TYPE,
                )
            validate_size(product, request.size)
            cart = await self._get_or_create(owner)
            existing = next(
                (i for i in cart.items if i.product_id == product.id and i.size == request.size),
                None,
            )
            if existing is None and len(cart.items) >= self._settings.cart_max_lines:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Your cart is full",
                    f"A cart holds at most {self._settings.cart_max_lines} different items.",
                    type_=CART_FULL_TYPE,
                )
            wanted = (existing.quantity if existing else 0) + request.quantity
            available = sellable_quantity(product, limit)
            if wanted > available:
                raise self._insufficient_stock(product, available)
            await self._carts.add_quantity(
                cart_id=cart.id,
                product_id=product.id,
                size=request.size,
                quantity=request.quantity,
                cap=limit,
            )
            return await self._render(await self._find(owner))

    async def set_quantity(self, owner: CartOwner, item_id: int, quantity: int) -> CartOut:
        async with self._session.begin():
            cart, item = await self._require_item(owner, item_id)
            product = (await self._products.get_many([item.product_id])).get(item.product_id)
            available = sellable_quantity(product, self._settings.cart_max_quantity)
            if quantity > available:
                raise self._insufficient_stock(product, available)
            item.quantity = quantity
            await self._session.flush()
            await self._carts.touch(cart.id)
            return await self._render(await self._find(owner))

    async def remove_item(self, owner: CartOwner, item_id: int) -> CartOut:
        async with self._session.begin():
            cart, item = await self._require_item(owner, item_id)
            await self._carts.delete_item(item)
            await self._carts.touch(cart.id)
            return await self._render(await self._find(owner))

    async def clear(self, owner: CartOwner) -> CartOut:
        async with self._session.begin():
            cart = await self._find(owner)
            if cart is not None:
                await self._carts.clear(cart.id)
            return await self._render(await self._find(owner))

    # --- helpers --------------------------------------------------------------------------

    async def _get_or_create(self, owner: CartOwner) -> Cart:
        if owner.user_id is not None:
            return await self._carts.get_or_create(user_id=owner.user_id)
        assert owner.guest_token, "a guest cart needs a token"
        return await self._carts.get_or_create(guest_token_hash=hash_token(owner.guest_token))

    async def _find(self, owner: CartOwner) -> Cart | None:
        if owner.user_id is not None:
            return await self._carts.find(user_id=owner.user_id)
        if owner.guest_token:
            return await self._carts.find(guest_token_hash=hash_token(owner.guest_token))
        return None

    async def _render(self, cart: Cart | None) -> CartOut:
        ids = [item.product_id for item in cart.items] if cart else []
        products = await self._products.get_many(ids)
        return build_cart(cart, products, self._storage, self._settings)

    async def _require_item(self, owner: CartOwner, item_id: int) -> tuple[Cart, CartItem]:
        cart = await self._find(owner)
        item = await self._carts.find_item(cart.id, item_id) if cart else None
        if cart is None or item is None:
            raise ProblemError(
                HTTPStatus.NOT_FOUND,
                "Cart item not found",
                type_=CART_ITEM_NOT_FOUND_TYPE,
            )
        return cart, item

    @staticmethod
    def _insufficient_stock(product: Product | None, available: int) -> ProblemError:
        name = product.name if product else "This product"
        detail = (
            f"{name} is sold out."
            if available == 0
            else f"Only {available} of {name} can be added."
        )
        return ProblemError(
            HTTPStatus.CONFLICT,
            "Not enough stock",
            detail,
            type_=INSUFFICIENT_STOCK_TYPE,
            extensions={"available": available},
        )
