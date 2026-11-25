"""Захиалгын имэйлийн текст: баталгаажуулалт (бараа, хаяг, дүн) болон хугацаа дууссан мэдэгдэл."""

from angel.core.money import format_minor
from angel.models import Order

_METHODS = {
    "standard": "Энгийн хүргэлт",
    "express": "Шуурхай хүргэлт",
    "pickup": "Дэлгүүрээс авах",
}


def address_line(snapshot: dict[str, object]) -> str:
    """Монголын дарааллаар: аймаг/хот, дүүрэг/сум, хороо, гудамж, нэмэлт."""
    parts = (
        snapshot.get("region"),
        snapshot.get("city"),
        snapshot.get("khoroo"),
        snapshot.get("line1"),
        snapshot.get("line2"),
    )
    return ", ".join(str(part) for part in parts if part)


def confirmation_body(order: Order, charged: str) -> str:
    """ "Баярлалаа" имэйлийн бие: юу авсан, хаашаа, хэдэн төгрөг."""
    lines = [
        f"Баярлалаа! Таны {order.number} дугаартай захиалгын {charged} төлбөрийг хүлээн авлаа.",
        "",
        "Бараа:",
    ]
    for item in order.items:
        size = f" ({item.size})" if item.size else ""
        total = format_minor(item.unit_price_cents * item.quantity, order.currency)
        lines.append(f"  • {item.product_name}{size} × {item.quantity}: {total}")
    lines += [
        "",
        f"Хүргэлт: {_METHODS.get(order.shipping_method, order.shipping_method)}"
        f" ({format_minor(order.shipping_cents, order.currency)})",
        f"Хаяг: {address_line(order.shipping_address)}",
    ]
    phone = order.shipping_address.get("phone")
    if phone:
        lines.append(f"Утас: {phone}")
    lines += ["", f"Нийт: {format_minor(order.total_cents, order.currency)}"]
    return "\n".join(lines)


def expired_body(order: Order) -> str:
    return (
        f"{order.number} дугаартай захиалгын төлбөр хугацаандаа төлөгдөөгүй тул цуцлагдлаа. "
        "Танаас мөнгө авагдаагүй, таны сагс хэвээр байгаа тул хүсвэл дахин захиалж болно."
    )
