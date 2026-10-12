from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from angel.schemas.admin.orders import AdminOrderSummary
from angel.schemas.catalog.product import ProductImage


class StatsQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days: Annotated[int, Field(ge=1, le=366, description="Length of the period, ending today")] = 30


class Delta(BaseModel):
    """A figure for the period and for the equally long period just before it."""

    current: int
    previous: int


class DailyPoint(BaseModel):
    date: date
    revenue_cents: int
    orders: int


class LowStockProduct(BaseModel):
    id: int
    name: str
    slug: str
    stock_quantity: int
    image: ProductImage


class TopProduct(BaseModel):
    product_id: int
    name: str
    slug: str
    image: ProductImage
    units: int
    revenue_cents: int


class AdminStats(BaseModel):
    """The dashboard. Revenue counts orders that are paid, shipped or delivered, by the day they
    were paid; a refunded order is not revenue."""

    days: int
    currency: str
    revenue_cents: Delta
    orders: Delta
    units: Delta
    new_customers: Delta
    average_order_cents: Delta
    series: list[DailyPoint]
    status_counts: dict[str, int]
    to_ship: int
    awaiting_payment: int
    low_stock_threshold: int
    low_stock: list[LowStockProduct]
    low_stock_total: int
    out_of_stock_total: int
    top_products: list[TopProduct]
    recent_orders: list[AdminOrderSummary]


# --- customers --------------------------------------------------------------------------------

CustomerStatusFilter = Literal["all", "active", "inactive"]
CustomerSort = Literal["newest", "spent", "orders", "name"]


class AdminCustomerListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: Annotated[str | None, Field(min_length=1, max_length=100, description="Name or email")] = (
        None
    )
    status: CustomerStatusFilter = "all"
    sort: CustomerSort = "newest"
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 25


class AdminCustomer(BaseModel):
    id: int
    email: str
    full_name: str
    avatar_url: str | None
    is_active: bool
    created_at: datetime
    # Orders that were paid (including ones since refunded), what was paid for the ones that stand,
    # and when the last order of any kind was placed.
    orders_count: int
    total_spent_cents: int
    last_order_at: datetime | None


class AdminCustomerPage(BaseModel):
    items: list[AdminCustomer]
    total: int
    page: int
    page_size: int
    pages: int


class AdminCustomerDetail(AdminCustomer):
    providers: list[str]
    has_password: bool
    recent_orders: list[AdminOrderSummary]


# --- stock ------------------------------------------------------------------------------------


class StockUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: Annotated[int, Field(ge=0, le=100_000)]
