"""Checkout: cart-ыг нөөцийг барьдаг pending захиалга болгоод төлбөрийг эхлүүлнэ.

Захиалга гурван богино transaction-аар үүснэ, төлбөрийн provider-ийн дуудлага тэдгээрийн хооронд
байх бөгөөд transaction дотор хэзээ ч биш (сүлжээ хүлээдэг transaction сүлжээ дуустал мөрийн
түгжээг барина):

1. idempotency key-г хайж, хэрэглэгчийн хуучин төлөгдөөгүй захиалгуудыг олох;
2. тэдгээр захиалгын төлбөрийг provider дээр цуцлах (transaction-гүй);
3. нэг transaction: нөөцийн мөрүүдийг id-н дарааллаар түгжиж, cart-ыг дахин шалгаж, нөөцийг
   хасаж, захиалгыг үнийн snapshot-тай бичих;
4. төлбөр үүсгэж (transaction-гүй), дараа нь хадгалах.

Хүсэлтийг давтахад (ижил `Idempotency-Key`) дутуу үлдсэн алхамаас үргэлжилнэ, тиймээс аль ч
үед timeout болсон client хүсэлтээ дахин илгээхэд хангалттай."""

import contextlib
import secrets
from collections import defaultdict
from http import HTTPStatus
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    ADDRESS_NOT_FOUND_TYPE,
    CART_EMPTY_TYPE,
    CHECKOUT_BUSY_TYPE,
    CONTACT_EMAIL_REQUIRED_TYPE,
    INSUFFICIENT_STOCK_TYPE,
    ORDER_NOT_FOUND_TYPE,
    PAYMENT_IN_PROGRESS_TYPE,
    PAYMENT_PROVIDER_TYPE,
    PAYMENTS_UNAVAILABLE_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.models import Order, OrderItem, Payment
from angel.payments import PaymentEvent, PaymentGateway, PaymentProviderError
from angel.repositories.accounts.users import AddressRepository, UserRepository
from angel.repositories.catalog.products import ProductRepository
from angel.repositories.commerce.carts import CartRepository
from angel.repositories.commerce.orders import OrderRepository
from angel.schemas.accounts.address import AddressSnapshot
from angel.schemas.commerce.order import (
    CheckoutOut,
    CheckoutRequest,
    OrderOut,
    PaymentOut,
    ShippingMethodList,
)
from angel.services.commerce.cart import validate_size
from angel.services.commerce.order_lifecycle import release_order
from angel.services.commerce.payments import PaymentSettlement
from angel.services.commerce.shipping import shipping_cost, shipping_methods
from angel.services.mappers import to_order_out
from angel.storage import Storage

log = get_logger(__name__)

# 0/O/1/I байхгүй: захиалгын дугаарыг утсаар уншиж өгдөг.
MAX_ATTEMPTS = 5
_NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def new_order_number() -> str:
    return "LK-" + "".join(secrets.choice(_NUMBER_ALPHABET) for _ in range(8))


class CheckoutService:
    def __init__(
        self,
        session: AsyncSession,
        storage: Storage,
        settings: Settings,
        gateway: PaymentGateway | None,
        settlement: PaymentSettlement | None,
    ) -> None:
        self._session = session
        self._storage = storage
        self._settings = settings
        self._gateway = gateway
        self._settlement = settlement
        self._orders = OrderRepository(session)
        self._products = ProductRepository(session)
        self._carts = CartRepository(session)
        self._addresses = AddressRepository(session)

    def shipping_methods(self) -> ShippingMethodList:
        return shipping_methods(self._settings)

    async def create_checkout(
        self, user_id: int, request: CheckoutRequest, idempotency_key: str
    ) -> CheckoutOut:
        gateway = self._require_gateway()

        order_id = await self._existing_order_id(user_id, idempotency_key)
        if order_id is None:
            # Хэрэглэгчийн төлөгдөөгүй захиалгуудыг нөөцийг нь шинэ захиалгад өгөхөөс өмнө provider
            # дээр цуцлах ёстой, үгүй бол хоёулаа төлөгдөж болно. Үүнд сүлжээний дуудлага хэрэгтэй
            # тул transaction-уудын хооронд хийнэ; хэрэв ижил хэрэглэгчийн өөр checkout энэ хооронд
            # шинэ төлөгдөөгүй захиалга нэмсэн бол дахин нэг тойрно.
            cancelled: dict[int, str] = {}
            for _ in range(MAX_ATTEMPTS):
                placed = await self._place_order(user_id, request, idempotency_key, cancelled)
                if isinstance(placed, int):
                    order_id = placed
                    break
                for old_id, intent_id in placed.items():
                    cancelled[old_id] = await self._cancel_payment(gateway, intent_id)
            else:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Checkout is busy",
                    "Several checkouts ran at once. Please try again.",
                    type_=CHECKOUT_BUSY_TYPE,
                )

        return await self._complete(user_id, order_id, gateway)

    async def simulate_payment(self, user_id: int, number: str) -> OrderOut:
        """Зөвхөн offline горим: provider баталгаажуулсан мэт захиалгыг төлнө."""
        gateway = self._require_gateway()
        if gateway.mode != "offline" or self._settlement is None:
            raise ProblemError(HTTPStatus.NOT_FOUND, "Not found")
        async with self._session.begin():
            order = await self._orders.get_for_user(user_id, number)
            if order is None:
                raise self._order_not_found()
            if order.status == "cancelled" or order.payment is None:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "This order can no longer be paid",
                    type_=PAYMENT_IN_PROGRESS_TYPE,
                )
            event = PaymentEvent(
                id=f"evt_offline_{uuid4().hex}",
                kind="succeeded",
                intent_id=order.payment.provider_payment_id,
                amount_cents=order.total_cents,
                currency=order.currency,
            )
            already_paid = order.status == "paid"
        if not already_paid:
            await self._settlement.handle(event)
        async with self._session.begin():
            fresh = await self._orders.get_for_user(user_id, number)
            assert fresh is not None
            return to_order_out(fresh, self._storage)

    # --- алхмууд ---

    async def _existing_order_id(self, user_id: int, idempotency_key: str) -> int | None:
        async with self._session.begin():
            await self._lock_user(user_id)
            existing = await self._orders.get_by_idempotency_key(user_id, idempotency_key)
            return existing.id if existing else None

    async def _place_order(
        self,
        user_id: int,
        request: CheckoutRequest,
        idempotency_key: str,
        cancelled: dict[int, str],
    ) -> int | dict[int, str]:
        """Захиалгын id, эсвэл үргэлжлэхээсөө өмнө provider дээр төлбөрийг нь цуцлах ёстой
        төлөгдөөгүй захиалгуудын {order id: payment id} (тэр үед юу ч өөрчлөгдөхгүй)."""
        async with self._session.begin():
            await self._lock_user(user_id)
            # Ижил key-тэй зэрэг ирсэн хүсэлт сүүлийн харцаас хойш дуусч болсон.
            existing = await self._orders.get_by_idempotency_key(user_id, idempotency_key)
            if existing is not None:
                return existing.id

            pending = await self._orders.pending_for_user(user_id)
            uncancelled = {
                order.id: order.payment.provider_payment_id
                for order in pending
                if order.payment is not None and order.id not in cancelled
            }
            if uncancelled:
                return uncancelled

            stale: list[Order] = []
            for old in pending:
                locked = await self._orders.get_for_update(old.id)
                if locked is None or locked.status != "pending":
                    continue
                if cancelled.get(old.id) == "succeeded":
                    raise ProblemError(
                        HTTPStatus.CONFLICT,
                        "A payment is already going through",
                        "Your previous order was just paid. Check your orders before "
                        "placing another.",
                        type_=PAYMENT_IN_PROGRESS_TYPE,
                    )
                stale.append(locked)

            user = await UserRepository(self._session).get(user_id)
            address = await self._addresses.get(user_id, request.address_id)
            if address is None:
                raise ProblemError(
                    HTTPStatus.NOT_FOUND,
                    "Address not found",
                    "Choose one of your saved addresses.",
                    type_=ADDRESS_NOT_FOUND_TYPE,
                )
            assert user is not None  # token-ийн subject; хэрэглэгч хэзээ ч устгагддаггүй
            contact_email = request.contact_email or user.email
            if contact_email is None:
                raise ProblemError(
                    HTTPStatus.UNPROCESSABLE_ENTITY,
                    "An email is needed for the order",
                    "Enter the email address that should receive the order updates.",
                    type_=CONTACT_EMAIL_REQUIRED_TYPE,
                )
            cart = await self._carts.find(user_id=user_id)
            if cart is None or not cart.items:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Your cart is empty",
                    type_=CART_EMPTY_TYPE,
                )

            # Энэ transaction-д хамаарах бүх барааг нэг эрэмбэлсэн statement-ээр түгжинэ.
            product_ids = {item.product_id for item in cart.items}
            product_ids |= {item.product_id for order in stale for item in order.items}
            products = await self._products.get_many(sorted(product_ids), for_update=True)
            for order in stale:
                await release_order(self._session, order, "replaced")

            needed: dict[int, int] = defaultdict(int)
            problems: list[dict[str, Any]] = []
            for line in cart.items:
                product = products.get(line.product_id)
                if product is None or not product.is_active:
                    problems.append(
                        {"product_id": line.product_id, "size": line.size, "available": 0}
                    )
                    continue
                try:
                    validate_size(product, line.size)
                except ProblemError:
                    problems.append(
                        {"product_id": line.product_id, "size": line.size, "available": 0}
                    )
                    continue
                needed[line.product_id] += line.quantity
            for product_id, quantity in needed.items():
                available = products[product_id].stock_quantity
                if quantity > available:
                    problems.append({"product_id": product_id, "available": available})
            if problems:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Some items are no longer available",
                    "Update your cart and try again.",
                    type_=INSUFFICIENT_STOCK_TYPE,
                    extensions={"issues": problems},
                )

            for product_id, quantity in needed.items():
                products[product_id].stock_quantity -= quantity
            items = [
                OrderItem(
                    product_id=line.product_id,
                    product_name=products[line.product_id].name,
                    product_slug=products[line.product_id].slug,
                    image_key=products[line.product_id].image_key,
                    size=line.size,
                    unit_price_cents=products[line.product_id].price_cents,
                    quantity=line.quantity,
                )
                for line in cart.items
            ]
            subtotal = sum(item.unit_price_cents * item.quantity for item in items)
            shipping = shipping_cost(self._settings, request.shipping_method, subtotal)
            order = Order(
                number=new_order_number(),
                user_id=user_id,
                status="pending",
                idempotency_key=idempotency_key,
                currency=self._settings.currency,
                subtotal_cents=subtotal,
                shipping_cents=shipping,
                total_cents=subtotal + shipping,
                shipping_method=request.shipping_method,
                shipping_address=AddressSnapshot.model_validate(
                    address, from_attributes=True
                ).model_dump(),
                contact_email=contact_email,
            )
            await self._orders.add(order, items)
            self._orders.add_event(order.id, "placed")
            return order.id

    async def _complete(self, user_id: int, order_id: int, gateway: PaymentGateway) -> CheckoutOut:
        """Захиалгад төлбөр байгаа эсэхийг баталгаажуулаад browser-т тайлбарлана."""
        async with self._session.begin():
            order = await self._orders.get_by_id(order_id)
            assert order is not None
            number, total, currency = order.number, order.total_cents, order.currency
            needs_payment = order.status == "pending" and order.payment is None

        if needs_payment:
            try:
                intent = await gateway.create_intent(
                    amount_cents=total,
                    currency=currency,
                    order_number=number,
                    # Ижил захиалгад дуудлагыг давтавал ижил PaymentIntent буцна.
                    idempotency_key=f"order-{order_id}",
                )
            except PaymentProviderError as exc:
                log.error("payment_setup_failed", order=number, error=str(exc))
                await self._abort(order_id)
                raise ProblemError(
                    HTTPStatus.BAD_GATEWAY,
                    "Payment provider unavailable",
                    "We could not start the payment. Your cart is unchanged, please try again.",
                    type_=PAYMENT_PROVIDER_TYPE,
                ) from exc
            async with self._session.begin():
                current = await self._orders.get_for_update(order_id)
                still_open = current is not None and current.status == "pending"
                await self._orders.add_payment_if_missing(
                    Payment(
                        order_id=order_id,
                        provider=gateway.mode,
                        provider_payment_id=intent.id,
                        client_secret=intent.client_secret if still_open else None,
                        status="requires_payment" if still_open else "canceled",
                        amount_cents=total,
                        currency=currency,
                    )
                )
            if not still_open:
                # Intent үүсч байх хооронд шинэ checkout-оор солигдсон: хаа.
                with contextlib.suppress(PaymentProviderError):
                    await gateway.cancel_intent(intent.id)

        async with self._session.begin():
            final = await self._orders.get_for_user(user_id, number)
            assert final is not None
            payment = final.payment
            return CheckoutOut(
                order=to_order_out(final, self._storage),
                payment=PaymentOut(
                    provider=gateway.mode,
                    client_secret=(
                        payment.client_secret if payment and final.status == "pending" else None
                    ),
                ),
            )

    async def _abort(self, order_id: int) -> None:
        """Provider төлбөр үүсгэхээс татгалзсан: нөөцийг буцаа."""
        async with self._session.begin():
            order = await self._orders.get_for_update(order_id)
            if order is not None and order.payment is None:
                await release_order(self._session, order, "payment_setup_failed")

    async def _cancel_payment(self, gateway: PaymentGateway, intent_id: str) -> str:
        try:
            return await gateway.cancel_intent(intent_id)
        except PaymentProviderError as exc:
            raise ProblemError(
                HTTPStatus.BAD_GATEWAY,
                "Payment provider unavailable",
                "We could not replace your previous unpaid order. Please try again.",
                type_=PAYMENT_PROVIDER_TYPE,
            ) from exc

    async def _lock_user(self, user_id: int) -> None:
        """Нэг хэрэглэгчийн checkout-ууд нэг нэгээр ажиллана (commit дээр чөлөөлөгдөнө). Өөр
        хэрэглэгчид энд хоорондоо хүлээхгүй."""
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"checkout:{user_id}"},
        )

    def _require_gateway(self) -> PaymentGateway:
        if self._gateway is None:
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Payments are not available",
                "Card payments are not configured on this server.",
                type_=PAYMENTS_UNAVAILABLE_TYPE,
            )
        return self._gateway

    @staticmethod
    def _order_not_found() -> ProblemError:
        return ProblemError(HTTPStatus.NOT_FOUND, "Order not found", type_=ORDER_NOT_FOUND_TYPE)
