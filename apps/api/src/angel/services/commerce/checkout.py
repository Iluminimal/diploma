"""Checkout: turn the cart into a pending order that holds the stock, and start the payment.

The order is created in three short transactions with the payment provider call between them,
never inside one (a transaction that waits on the network holds row locks for as long as the
network takes):

1. look up the idempotency key and find the user's older unpaid orders;
2. cancel those orders' payments at the provider (no transaction);
3. one transaction: lock stock rows in id order, re-validate the cart, decrement stock, write the
   order with its price snapshot;
4. create the payment (no transaction), then store it.

Replaying the request (same `Idempotency-Key`) skips ahead to whatever is missing, so a client
that timed out at any point can simply repeat the request.
"""

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

# No 0/O/1/I: order numbers get read out over the phone.
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
            # Unpaid orders of this user must be cancelled at the provider before their stock is
            # handed to the new order, or both could end up paid. That needs a network call, so it
            # happens between transactions; if another checkout of the same user slipped a new
            # unpaid order in meanwhile, go round again.
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
        """Offline mode only: pay for an order as if the provider had confirmed it."""
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

    # --- steps ------------------------------------------------------------------------------

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
        """The order's id, or {order id: payment id} of unpaid orders whose payment still has to
        be cancelled at the provider before this can proceed (nothing is changed then)."""
        async with self._session.begin():
            await self._lock_user(user_id)
            # A concurrent request with the same key may have finished since the last look.
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
            assert user is not None  # the token's subject; users are never deleted
            cart = await self._carts.find(user_id=user_id)
            if cart is None or not cart.items:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Your cart is empty",
                    type_=CART_EMPTY_TYPE,
                )

            # Lock every product this transaction touches in one ordered statement.
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
                contact_email=user.email,
            )
            await self._orders.add(order, items)
            self._orders.add_event(order.id, "placed")
            return order.id

    async def _complete(self, user_id: int, order_id: int, gateway: PaymentGateway) -> CheckoutOut:
        """Make sure the order has a payment, then describe it for the browser."""
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
                    # Repeating the call for the same order returns the same PaymentIntent.
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
                # Replaced by a newer checkout while the intent was being created: close it.
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
        """The provider refused to create a payment: give the stock back."""
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
        """Checkouts of one user run one at a time (released at commit). Different users never
        wait for each other here."""
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
