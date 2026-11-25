from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from angel.db.base import Base
from angel.models.mixins import TimestampMixin


class Order(TimestampMixin, Base):
    """pending -> paid -> shipped -> delivered; pending -> cancelled; paid, shipped, delivered
    -> refunded. Төлөгдсөн захиалга хэзээ ч "cancelled" болохгүй: мөнгө нь буцаж `refunded` болно.
    Аль хэдийн цуцлагдсан захиалгад ирсэн төлбөрийг буцаан олгоно. Өөрчлөлт бүрийг `OrderEvent`
    болгон бүртгэнэ."""

    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')",
            name="status_valid",
        ),
        CheckConstraint("subtotal_cents >= 0 AND shipping_cents >= 0", name="amounts_non_negative"),
        CheckConstraint("total_cents = subtotal_cents + shipping_cents", name="total_matches"),
        UniqueConstraint("user_id", "idempotency_key"),
        Index("ix_orders_user_id_created_at", "user_id", "created_at"),
        # Хугацаа дууссаныг цэвэрлэгч зөвхөн pending захиалгыг харна.
        Index(
            "ix_orders_pending_created_at",
            "created_at",
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    number: Mapped[str] = mapped_column(String(20), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), server_default="pending")
    cancel_reason: Mapped[str | None] = mapped_column(String(40))
    idempotency_key: Mapped[str] = mapped_column(String(100))

    currency: Mapped[str] = mapped_column(String(3))
    subtotal_cents: Mapped[int] = mapped_column(BigInteger)
    shipping_cents: Mapped[int] = mapped_column(BigInteger)
    total_cents: Mapped[int] = mapped_column(BigInteger)
    shipping_method: Mapped[str] = mapped_column(String(20))
    # Заагаагүй, хуулсан: хадгалсан хаягийг засах/устгах нь өмнөх захиалгыг өөрчилж болохгүй.
    shipping_address: Mapped[dict[str, Any]] = mapped_column(JSONB)
    contact_email: Mapped[str] = mapped_column(String(320))

    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Хүргэлт: илгээмж явах, хүрэх үед администратор тохируулна.
    carrier: Mapped[str | None] = mapped_column(String(40))
    tracking_number: Mapped[str | None] = mapped_column(String(100))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", order_by="OrderItem.id", lazy="raise"
    )
    payment: Mapped["Payment | None"] = relationship(
        back_populates="order", uselist=False, lazy="raise"
    )
    events: Mapped[list["OrderEvent"]] = relationship(
        back_populates="order", order_by="OrderEvent.id", lazy="raise"
    )


class OrderEvent(TimestampMixin, Base):
    """Захиалгад юу, хэзээ болсон: үүссэн, төлөгдсөн, илгээгдсэн, хүргэгдсэн, цуцлагдсан,
    буцаагдсан, эсвэл администраторын дотоод тэмдэглэл. `data` дэлгэрэнгүйг (carrier, tracking
    number, шалтгаан, хэн хийсэн) агуулна; `actor_id` нь системийн хийсэн зүйлд хоосон."""

    __tablename__ = "order_events"
    __table_args__ = (Index("ix_order_events_order_id", "order_id"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    order: Mapped[Order] = relationship(back_populates="events", lazy="raise")


class OrderItem(TimestampMixin, Base):
    """Үнийн snapshot: каталог өөрчлөгдөхөд худалдан авагчаас авсан үнэ өөрчлөгдөхгүй."""

    __tablename__ = "order_items"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="quantity_positive"),
        CheckConstraint("unit_price_cents >= 0", name="price_non_negative"),
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_product_id", "product_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    product_name: Mapped[str] = mapped_column(String(300))
    product_slug: Mapped[str] = mapped_column(String(200))
    image_key: Mapped[str] = mapped_column(String(200))
    size: Mapped[str] = mapped_column(String(16), server_default="")
    unit_price_cents: Mapped[int] = mapped_column(BigInteger)
    quantity: Mapped[int] = mapped_column(SmallInteger)

    order: Mapped[Order] = relationship(back_populates="items", lazy="raise")


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "status IN ('requires_payment', 'succeeded', 'failed', 'canceled', 'refunded')",
            name="status_valid",
        ),
        CheckConstraint("amount_cents >= 0", name="amount_non_negative"),
        CheckConstraint("charge_minor >= 0", name="charge_non_negative"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    provider: Mapped[str] = mapped_column(String(20))
    # Provider дээрх төлбөрийн id (QPay-д invoice_id): мэдэгдэл, шалгалт үүнийг заана.
    provider_payment_id: Mapped[str] = mapped_column(String(100), unique=True)
    # Browser төлөхөд хэрэгтэй зүйл (QPay: QR зураг, банкны апп-ын холбоос). Checkout давтагдахад
    # ижил QR-ыг буцаана; төлбөр шийдэгдсэний дараа цэвэрлэнэ.
    provider_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20))
    # Захиалгын үндсэн валютаар (USD) дүн.
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    # Бодитоор авах дүн, төлбөр үүсэх үед түгжсэн ханшаар (Amazon Currency Converter шиг): ханш
    # хожим өөрчлөгдсөн ч энэ дүн, буцаалт өөрчлөгдөхгүй. `charge_minor` нь минор нэгжээр
    # (MNT: төгрөг x 100), `exchange_rate` нь 1 `currency` = ? `charge_currency`.
    charge_currency: Mapped[str] = mapped_column(String(3))
    charge_minor: Mapped[int] = mapped_column(BigInteger)
    exchange_rate: Mapped[Decimal] = mapped_column(Numeric(14, 6))
    last_error: Mapped[str | None] = mapped_column(String(300))
    refund_id: Mapped[str | None] = mapped_column(String(100))

    order: Mapped[Order] = relationship(back_populates="payment", lazy="raise")


class ProcessedPaymentEvent(TimestampMixin, Base):
    """Боловсруулсан төлбөрийн event бүрийн id (QPay-д payment_id). Төлөв өөрчилсөн transaction-д
    нь хамт бичдэг тул мэдэгдэл, шалгалт хэдэн ч удаа давтагдсан event яг нэг л удаа хэрэгжинэ."""

    __tablename__ = "payment_events"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    type: Mapped[str] = mapped_column(String(100))
