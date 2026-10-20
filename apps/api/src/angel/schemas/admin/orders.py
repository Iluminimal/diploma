from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from angel.schemas.commerce.order import OrderEventOut, OrderOut, OrderStatus

# --- захиалгууд (зөвхөн унших) ---

AdminOrderStatusFilter = Literal[
    "all", "pending", "paid", "shipped", "delivered", "cancelled", "refunded"
]


class AdminOrderListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: Annotated[
        str | None,
        Field(min_length=1, max_length=100, description="Order number or customer email"),
    ] = None
    status: AdminOrderStatusFilter = "all"
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 25


class AdminOrderSummary(BaseModel):
    number: str
    status: OrderStatus
    created_at: datetime
    currency: str
    total_cents: int
    item_count: int
    customer_email: str
    customer_name: str
    payment_status: str | None


class AdminOrderPage(BaseModel):
    items: list[AdminOrderSummary]
    # `q` хайлтад таарах захиалгын төлөв бүрийн тоо (tab-ууд үүнийг харуулна), `status`-аас үл
    # хамаарна.
    status_counts: dict[str, int]
    total: int
    page: int
    page_size: int
    pages: int


class AdminPaymentOut(BaseModel):
    """Төлбөрийн бичлэг. Client secret server-ээс хэзээ ч гадагш гарахгүй."""

    provider: str
    provider_payment_id: str
    status: str
    amount_cents: int
    currency: str
    last_error: str | None
    refund_id: str | None


class AdminOrderEventOut(OrderEventOut):
    """Ижил алхам, гэхдээ administrator харж болох бүх зүйлтэй: тэмдэглэл, хэн хийсэн."""

    type: Literal["placed", "paid", "shipped", "delivered", "cancelled", "refunded", "note"]  # type: ignore[assignment]
    data: dict[str, Any]


class AdminOrderOut(OrderOut):
    user_id: int
    cancel_reason: str | None
    cancelled_at: datetime | None
    payment: AdminPaymentOut | None
    events: list[AdminOrderEventOut]  # type: ignore[assignment]


# --- захиалгын үйлдлүүд ---

Carrier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
TrackingNumber = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
Reason = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ShipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    carrier: Carrier
    tracking_number: TrackingNumber


class CancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Reason | None = None


class RefundRequest(BaseModel):
    """Үргэлж бүтэн дүн (төлбөрийн gateway-ийн дэмждэг зүйл)."""

    model_config = ConfigDict(extra="forbid")

    reason: Reason
    # Бараа нөөцөд буцаана: хэзээ ч явагдаагүй захиалгад тийм, аль хэдийн илгээсэнд үгүй.
    restock: bool


class NoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
