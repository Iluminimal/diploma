from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from angel.schemas.admin.orders import AdminOrderSummary
from angel.schemas.catalog.product import ProductImage


class StatsQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days: Annotated[int, Field(ge=1, le=366, description="Length of the period, ending today")] = 30
    start: Annotated[date | None, Field(description="First day of a custom period")] = None
    end: Annotated[date | None, Field(description="Last day of a custom period (inclusive)")] = None

    @model_validator(mode="after")
    def _custom_period(self) -> Self:
        if (self.start is None) != (self.end is None):
            raise ValueError("start and end go together")
        if self.start is not None and self.end is not None:
            if self.start > self.end:
                raise ValueError("start must not be after end")
            if self.end > datetime.now(UTC).date():
                raise ValueError("end must not be in the future")
            span = (self.end - self.start).days + 1
            if span > 366:
                raise ValueError("a period is at most 366 days")
            self.days = span
        return self

    def window(self) -> tuple[datetime, datetime]:
        """Тооцох хугацааны [эхлэл, төгсгөл) (UTC-ийн бүтэн өдрүүд): тусгай хугацаа, эсвэл өнөөдрөөр
        төгсөх `days` өдөр."""
        midnight = datetime.min.time()
        last = self.end or datetime.now(UTC).date()
        end = datetime.combine(last + timedelta(days=1), midnight, UTC)
        return end - timedelta(days=self.days), end


class Delta(BaseModel):
    """Тухайн хугацааны болон түүнтэй ижил урттай өмнөх хугацааны үзүүлэлт."""

    current: int
    previous: int


class DailyPoint(BaseModel):
    date: date
    revenue_cents: int
    orders: int
    units: int
    new_customers: int


class Funnel(BaseModel):
    """Хугацаанд үүссэн захиалгуудаас аль шатанд хүрсэн нь."""

    created: int
    paid: int
    shipped: int
    delivered: int
    cancelled: int
    refunded: int


class CategorySales(BaseModel):
    # None нь "бусад" (дээд ангилалд багтаагүй үлдсэн нийлбэр).
    name: str | None
    revenue_cents: int
    units: int


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
    """Dashboard. Орлого нь төлөгдсөн, илгээсэн, хүргэсэн захиалгыг төлөгдсөн өдрөөр нь тооцно;
    буцаан олгосон захиалга орлого биш."""

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
    start: date
    end: date
    funnel: Funnel
    by_category: list[CategorySales]
    # Хугацаанд 2+ захиалгатай худалдан авагч / төлсөн худалдан авагч. Хугацаанд худалдан авалт
    # байхгүй бол None. Бусад хувь (0..1) мөн адил.
    repeat_customer_rate: float | None
    refund_rate: float | None
    cancel_rate: float | None
    avg_ship_hours: float | None
    overdue_to_ship: int
    ship_sla_hours: int


# --- хэрэглэгчид ---

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
    email: str | None
    phone: str | None
    full_name: str
    avatar_url: str | None
    is_active: bool
    created_at: datetime
    # Төлөгдсөн захиалгууд (дараа нь буцаан олгосон ч орно), баталгаатай захиалгын төлсөн дүн, мөн
    # ямар ч төрлийн хамгийн сүүлийн захиалга өгсөн цаг.
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


# --- нөөц ---


class StockUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quantity: Annotated[int, Field(ge=0, le=100_000)]
