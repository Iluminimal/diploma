from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from angel.models import Order
from angel.repositories.orders import OrderRepository
from angel.repositories.products import ProductRepository


async def release_order(
    session: AsyncSession, order: Order, reason: str, *, actor: tuple[int, str] | None = None
) -> bool:
    """Cancel a pending order and give its reserved stock back.

    The caller holds the order row lock (`OrderRepository.get_for_update`) and runs inside a
    transaction. Returns False, doing nothing, when the order is no longer pending: replays,
    redelivered webhooks and the expiry sweeper can all arrive here for the same order.
    """
    if order.status != "pending":
        return False
    quantities: dict[int, int] = defaultdict(int)
    for item in order.items:
        quantities[item.product_id] += item.quantity
    # Rows are locked in id order, like everywhere else, so concurrent checkouts cannot deadlock.
    products = await ProductRepository(session).get_many(list(quantities), for_update=True)
    for product_id, quantity in quantities.items():
        products[product_id].stock_quantity += quantity
    order.status = "cancelled"
    order.cancel_reason = reason
    order.cancelled_at = datetime.now(UTC)
    payment = order.payment
    if payment is not None and payment.status in ("requires_payment", "failed"):
        payment.status = "canceled"
        payment.client_secret = None
    data: dict[str, object] = {"reason": reason}
    if actor is not None:
        data["actor"] = actor[1]
    OrderRepository(session).add_event(
        order.id, "cancelled", data, actor_id=actor[0] if actor else None
    )
    await session.flush()
    return True
