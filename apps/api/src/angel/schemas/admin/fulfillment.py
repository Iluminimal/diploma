from datetime import datetime

from pydantic import BaseModel

from angel.schemas.admin.audit import AuditEntry
from angel.schemas.admin.dashboard import LowStockProduct
from angel.schemas.catalog.product import ProductImage


class QueueLine(BaseModel):
    name: str
    quantity: int
    image: ProductImage


class QueuedOrder(BaseModel):
    """Илгээхийг хүлээж буй (төлөгдсөн) захиалга."""

    number: str
    customer_name: str
    item_count: int
    paid_at: datetime
    waiting_hours: int
    # Төлөгдсөнөөс хойш `SHIP_SLA_HOURS`-оос илүү өнгөрсөн.
    overdue: bool
    lines: list[QueueLine]


class FulfillmentBoard(BaseModel):
    """Агуулахын ажилтны нүүр: юуг илгээх, нөөц хаана дууссан, өөрийн сүүлийн үйлдлүүд. Орлого,
    хэрэглэгчийн мэдээлэл ороогүй."""

    sla_hours: int
    to_ship: int
    overdue: int
    oldest_paid_at: datetime | None
    shipped_today: int
    delivered_today: int
    # Сүүлийн 7 хоногт илгээсэн захиалгын төлөгдсөнөөс илгээх хүртэлх дундаж цаг; үгүй бол None.
    avg_ship_hours: float | None
    out_of_stock: int
    low_stock: int
    low_stock_threshold: int
    queue: list[QueuedOrder]
    stock_alerts: list[LowStockProduct]
    my_activity: list[AuditEntry]
