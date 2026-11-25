from dataclasses import dataclass
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    CART_FULL_TYPE,
    CART_ITEM_NOT_FOUND_TYPE,
    INSUFFICIENT_STOCK_TYPE,
    INVALID_SIZE_TYPE,
    ORDER_NOT_FOUND_TYPE,
    PRODUCT_NOT_FOUND_TYPE,
    ProblemError,
)
from angel.core.security import hash_token
from angel.models import Cart, CartItem, Product
from angel.repositories.catalog.products import ProductRepository
from angel.repositories.commerce.carts import CartRepository
from angel.repositories.commerce.orders import OrderRepository
from angel.schemas.commerce.cart import (
    CartIssue,
    CartItemIn,
    CartLineOut,
    CartOut,
    ReorderOut,
    ReorderReason,
    ReorderSkipped,
)
from angel.services.catalog.sizes import sizes_for
from angel.services.mappers import to_product_out
from angel.storage import Storage


@dataclass(frozen=True)
class CartOwner:
    """Хүсэлт хэний cart-ын тухай вэ: нэвтэрсэн хэрэглэгч, эсвэл `lk_cart` cookie-ийн түүхий
    утгаар тодорхойлогдох зочин (зөвхөн hash нь хадгалагдана)."""

    user_id: int | None = None
    guest_token: str | None = None


def sellable_quantity(product: Product | None, max_per_line: int) -> int:
    """Бараанаас яг одоо хэдийг авч болох вэ: нөөц, мөрийн хязгаараар хязгаарлагдсан."""
    if product is None or not product.is_active:
        return 0
    return max(0, min(product.stock_quantity, max_per_line))


def validate_size(product: Product, size: str) -> None:
    sizes = sizes_for(product)
    if sizes and size not in sizes:
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Хэмжээгээ сонгоно уу",
            f"Боломжит хэмжээ: {', '.join(sizes)}.",
            type_=INVALID_SIZE_TYPE,
            extensions={"sizes": list(sizes)},
        )
    if not sizes and size:
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Энэ бараанд хэмжээ байхгүй",
            type_=INVALID_SIZE_TYPE,
            extensions={"sizes": []},
        )


def build_cart(
    cart: Cart | None, products: dict[int, Product], storage: Storage, settings: Settings
) -> CartOut:
    lines: list[CartLineOut] = []
    for item in cart.items if cart else []:
        product = products.get(item.product_id)
        if product is None:  # боломжгүй (FK), гэхдээ cart хэзээ ч харагдахдаа унах ёсгүй
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
                price_when_added_cents=item.price_cents_at_add,
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
    """Зочны cart-ыг хэрэглэгчийнхтэй нэгтгээд устгана. Дуудагчийн transaction дотор (нэвтрэх,
    бүртгүүлэх) ажиллана, тиймээс амжилтгүй нэвтрэлт cart-ыг хагас нэгтгэхгүй.

    Ижил бараа, размер нийлнэ, гэхдээ нөөц эсвэл мөрийн хязгаараас хэзээ ч хэтрэхгүй.
    Хязгаараас аль хэдийн хэтэрсэн мөр (нөөц хасагдсан) өөрчлөгдөхгүй, чимээгүй багасгахгүй:
    cart асуудлыг харууулж, худалдан авагч шийднэ."""
    if not guest_token:
        return
    guest = await carts.find(guest_token_hash=hash_token(guest_token))
    if guest is None:
        return
    user_cart = await carts.get_or_create(user_id=user_id)
    stock = await products.get_many([item.product_id for item in guest.items])
    current = {(item.product_id, item.size): item.quantity for item in user_cart.items}
    for item in guest.items:
        # Дууссан мөр ч шилжинэ (тоо 1): cart үүнийг тэмдэглэнэ.
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
                unit_price_cents=item.price_cents_at_add,
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
                    "Бараа олдсонгүй",
                    f"{request.product_id} дугаартай бараа байхгүй байна.",
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
                    "Сагс дүүрсэн",
                    f"Сагсанд хамгийн ихдээ {self._settings.cart_max_lines} төрлийн бараа багтана.",
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
                unit_price_cents=product.price_cents,
            )
            return await self._render(await self._find(owner))

    async def reorder(self, user_id: int, number: str) -> ReorderOut:
        """Өмнөх захиалгын мөр бүрийг ижил размер, тоогоор сагсанд нэмнэ. Бүх мөр нэг transaction-д:
        аль нэг нь зогсоохгүй, нэмэгдэхгүй зүйлийг шалтгаантай нь буцаана (дууссан, хасагдсан,
        размер өөрчлөгдсөн, сагс дүүрсэн, эсвэл нөөцөөр цөөрсөн)."""
        limit = self._settings.cart_max_quantity
        skipped: list[ReorderSkipped] = []
        added = 0
        owner = CartOwner(user_id=user_id)
        async with self._session.begin():
            order = await OrderRepository(self._session).get_for_user(user_id, number)
            if order is None:
                raise ProblemError(
                    HTTPStatus.NOT_FOUND,
                    "Захиалга олдсонгүй",
                    type_=ORDER_NOT_FOUND_TYPE,
                )
            products = await self._products.get_many([item.product_id for item in order.items])
            cart = await self._get_or_create(owner)
            in_bag = {(i.product_id, i.size): i.quantity for i in cart.items}
            lines = len(in_bag)

            def skip(name: str, reason: ReorderReason) -> None:
                skipped.append(ReorderSkipped(name=name, reason=reason))

            for item in order.items:
                product = products.get(item.product_id)
                if product is None or not product.is_active:
                    skip(item.product_name, "unavailable")
                    continue
                available = sellable_quantity(product, limit)
                if available == 0:
                    skip(item.product_name, "out_of_stock")
                    continue
                try:
                    validate_size(product, item.size)
                except ProblemError:
                    skip(item.product_name, "size")
                    continue
                key = (product.id, item.size)
                already = in_bag.get(key, 0)
                if key not in in_bag and lines >= self._settings.cart_max_lines:
                    skip(item.product_name, "bag_full")
                    continue
                room = available - already
                quantity = min(item.quantity, room)
                if quantity <= 0:
                    skip(item.product_name, "reduced")
                    continue
                await self._carts.add_quantity(
                    cart_id=cart.id,
                    product_id=product.id,
                    size=item.size,
                    quantity=quantity,
                    cap=limit,
                    unit_price_cents=product.price_cents,
                )
                if key not in in_bag:
                    lines += 1
                in_bag[key] = already + quantity
                added += 1
                if quantity < item.quantity:
                    skip(item.product_name, "reduced")
            rendered = await self._render(await self._find(owner))
        return ReorderOut(cart=rendered, added=added, skipped=skipped)

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

    # --- туслах функцууд ---

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
                "Сагсан дахь бараа олдсонгүй",
                type_=CART_ITEM_NOT_FOUND_TYPE,
            )
        return cart, item

    @staticmethod
    def _insufficient_stock(product: Product | None, available: int) -> ProblemError:
        name = product.name if product else "Энэ бараа"
        detail = (
            f"{name} дууссан байна."
            if available == 0
            else f"{name}-аас зөвхөн {available} ширхэг нэмэх боломжтой."
        )
        return ProblemError(
            HTTPStatus.CONFLICT,
            "Үлдэгдэл хүрэлцэхгүй",
            detail,
            type_=INSUFFICIENT_STOCK_TYPE,
            extensions={"available": available},
        )
