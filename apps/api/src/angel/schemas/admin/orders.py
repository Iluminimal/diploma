from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from angel.schemas.commerce.order import OrderEventOut, OrderOut, OrderStatus

# --- orders (read-only) -----------------------------------------------------------------------

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
    # Orders per status for the search in `q` (the tabs show these), whatever `status` is.
    status_counts: dict[str, int]
    total: int
    page: int
    page_size: int
    pages: int


class AdminPaymentOut(BaseModel):
    """The payment record. The client secret never leaves the server."""

    provider: str
    provider_payment_id: str
    status: str
    amount_cents: int
    currency: str
    last_error: str | None
    refund_id: str | None


class AdminOrderEventOut(OrderEventOut):
    """The same step with everything an administrator may see: notes and who did it."""

    type: Literal["placed", "paid", "shipped", "delivered", "cancelled", "refunded", "note"]  # type: ignore[assignment]
    data: dict[str, Any]


class AdminOrderOut(OrderOut):
    user_id: int
    cancel_reason: str | None
    cancelled_at: datetime | None
    payment: AdminPaymentOut | None
    events: list[AdminOrderEventOut]  # type: ignore[assignment]


# --- order actions ----------------------------------------------------------------------------

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
    """Always the full amount (what the payment gateway supports)."""

    model_config = ConfigDict(extra="forbid")

    reason: Reason
    # Put the items back on the shelf: yes for an order that never left, not for one already sent.
    restock: bool


class NoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
