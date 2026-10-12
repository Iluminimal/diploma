from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import UploadFile
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from angel.schemas.order import OrderEventOut, OrderOut, OrderStatus
from angel.schemas.product import ProductImage

Gender = Literal["Men", "Women", "Boys", "Girls", "Unisex"]
Season = Literal["Fall", "Spring", "Summer", "Winter"]
ProductName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=300)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
# $100,000.00: far above anything the store sells, low enough to catch a slipped decimal point.
PriceCents = Annotated[int, Field(ge=0, le=10_000_000, description="Price in cents.")]
StockQuantity = Annotated[int, Field(ge=0, le=100_000)]
Year = Annotated[int, Field(ge=1900, le=2100)]


class AdminCategory(BaseModel):
    """An article type; products are filed under one of these."""

    id: int
    path: str
    master_category: str
    sub_category: str
    article_type: str


class ProductFields(BaseModel):
    name: ProductName
    category_id: int
    gender: Gender
    base_colour: ShortText | None = None
    season: Season | None = None
    usage: ShortText | None = None
    year: Year | None = None
    price_cents: PriceCents
    stock_quantity: StockQuantity = 0


class AdminProductCreateForm(ProductFields):
    """Multipart form: the product photo plus its details. The photo becomes the thumbnails and
    the embedding that visual search ranks against."""

    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]
    is_active: bool = True


class AdminProductUpdate(BaseModel):
    """Only the fields that are sent change. Sending `null` clears an optional field."""

    model_config = ConfigDict(extra="forbid")

    name: ProductName | None = None
    category_id: int | None = None
    gender: Gender | None = None
    base_colour: ShortText | None = None
    season: Season | None = None
    usage: ShortText | None = None
    year: Year | None = None
    price_cents: PriceCents | None = None
    stock_quantity: StockQuantity | None = None


class AdminProductImageForm(BaseModel):
    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]


AdminStatusFilter = Literal["all", "active", "inactive"]
AdminStockFilter = Literal["all", "low", "out"]
AdminSortKey = Literal["newest", "price_asc", "price_desc", "stock_asc"]


class AdminProductListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: Annotated[str | None, Field(min_length=1, max_length=200, description="Name or id")] = None
    status: AdminStatusFilter = "all"
    # "low": on the shelf but running out (see LOW_STOCK_THRESHOLD); "out": none left.
    stock: AdminStockFilter = "all"
    category_id: int | None = None
    sort: AdminSortKey = "newest"
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 25


class AdminProductOut(BaseModel):
    id: int
    slug: str
    name: str
    category_id: int
    gender: str
    master_category: str
    sub_category: str
    article_type: str
    base_colour: str | None
    season: str | None
    usage: str | None
    year: int | None
    price_cents: int
    currency: str
    stock_quantity: int
    is_active: bool
    # NULL for products created in the admin area; the dataset id for imported ones.
    source_id: int | None
    embedding_version: str
    image: ProductImage
    created_at: datetime
    updated_at: datetime


class AdminProductPage(BaseModel):
    items: list[AdminProductOut]
    total: int
    page: int
    page_size: int
    pages: int


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
