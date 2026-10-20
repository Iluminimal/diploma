from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from angel.schemas.accounts.address import AddressSnapshot
from angel.schemas.catalog.product import ProductImage

OrderStatus = Literal["pending", "paid", "shipped", "delivered", "cancelled", "refunded"]
ShippingMethodId = Literal["standard", "express"]


class ShippingMethodOut(BaseModel):
    id: ShippingMethodId
    label: str
    description: str
    price_cents: int
    estimated_days: str


class ShippingMethodList(BaseModel):
    items: list[ShippingMethodOut]
    currency: str
    free_shipping_threshold_cents: int


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address_id: Annotated[int, Field(ge=1, le=2**63 - 1)]
    shipping_method: ShippingMethodId
    # Захиалгын email хаашаа явах вэ. Бүртгэлд email байхгүй (утасны дугаараар бүртгүүлсэн) үед л
    # заавал; үгүй бол бүртгэлийн email-ийг хэрэглэнэ.
    contact_email: EmailStr | None = None

    @field_validator("contact_email", mode="after")
    @classmethod
    def _lower(cls, value: str | None) -> str | None:
        return value.lower() if value else value


class OrderItemOut(BaseModel):
    product_id: int
    name: str
    slug: str
    image: ProductImage
    size: str
    unit_price_cents: int
    quantity: int
    line_total_cents: int


class OrderEventOut(BaseModel):
    """Захиалгын түүхийн нэг алхам, худалдан авагчид харагддаг хэлбэрээр."""

    type: Literal["placed", "paid", "shipped", "delivered", "cancelled", "refunded"]
    at: datetime
    # Зөвхөн харуулахад аюулгүй зүйл: ачилтын тээвэрлэгч ба tracking дугаар, цуцалсан шалтгаан.
    data: dict[str, Any]


class OrderOut(BaseModel):
    number: str
    status: OrderStatus
    created_at: datetime
    paid_at: datetime | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    refunded_at: datetime | None
    carrier: str | None
    tracking_number: str | None
    events: list[OrderEventOut]
    currency: str
    subtotal_cents: int
    shipping_cents: int
    total_cents: int
    shipping_method: ShippingMethodId
    shipping_address: AddressSnapshot
    contact_email: str
    items: list[OrderItemOut]


class OrderSummary(BaseModel):
    number: str
    status: OrderStatus
    created_at: datetime
    currency: str
    total_cents: int
    item_count: int
    # Эхний хэдэн барааны зураг, түүхийн жагсаалтад.
    images: list[ProductImage]


class OrderPage(BaseModel):
    items: list[OrderSummary]
    total: int
    page: int
    page_size: int
    pages: int


class PaymentOut(BaseModel):
    """Browser төлбөр авахад хэрэгтэй зүйл. `stripe`: `client_secret`-ээр Stripe.js-ээр
    PaymentIntent-ийг баталгаажуулна. `offline` (development): simulate endpoint-ийг дуудна."""

    provider: Literal["stripe", "offline"]
    client_secret: str | None


class CheckoutOut(BaseModel):
    order: OrderOut
    payment: PaymentOut
