from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from angel.models import Order
from angel.repositories.catalog.products import ProductRepository
from angel.repositories.commerce.orders import OrderRepository


async def release_order(
    session: AsyncSession, order: Order, reason: str, *, actor: tuple[int, str] | None = None
) -> bool:
    """Pending захиалгыг цуцалж, нөөцөлсөн нөөцийг буцаана.

    Дуудагч захиалгын мөрийн түгжээг (`OrderRepository.get_for_update`) барьж, transaction
    дотор ажиллана. Захиалга pending биш болсон бол юу ч хийлгүй False буцаана: replay, дахин
    хүргэгдсэн webhook, expiry sweeper гурвуулаа ижил захиалгад ирж болно."""
    if order.status != "pending":
        return False
    quantities: dict[int, int] = defaultdict(int)
    for item in order.items:
        quantities[item.product_id] += item.quantity
    # Мөрүүдийг бусад газартай адил id-н дарааллаар түгжинэ, ингэвэл зэрэг checkout deadlock-д
    # орохгүй.
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
