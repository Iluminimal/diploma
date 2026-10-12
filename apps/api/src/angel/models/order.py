from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from angel.db.base import Base
from angel.models.mixins import TimestampMixin

ORDER_STATUSES = ("pending", "paid", "shipped", "delivered", "cancelled", "refunded")


class Order(TimestampMixin, Base):
    """pending -> paid -> shipped -> delivered; pending -> cancelled; paid, shipped or delivered
    -> refunded. A paid order is never "cancelled": its money goes back and it becomes
    `refunded`. A payment that arrives for an already cancelled order is refunded instead.
    Every change is recorded as an `OrderEvent`."""

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
        # The expiry sweeper only looks at pending orders.
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
    subtotal_cents: Mapped[int] = mapped_column(Integer)
    shipping_cents: Mapped[int] = mapped_column(Integer)
    total_cents: Mapped[int] = mapped_column(Integer)
    shipping_method: Mapped[str] = mapped_column(String(20))
    # Copied, not referenced: editing or deleting a saved address must not change a past order.
    shipping_address: Mapped[dict[str, Any]] = mapped_column(JSONB)
    contact_email: Mapped[str] = mapped_column(String(320))

    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Fulfilment: set by an administrator when the parcel leaves and when it arrives.
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
    """What happened to an order and when: placed, paid, shipped, delivered, cancelled, refunded,
    or an administrator's internal note. `data` carries the details (carrier and tracking number,
    the reason, who did it); `actor_id` is empty for things the system did."""

    __tablename__ = "order_events"
    __table_args__ = (Index("ix_order_events_order_id", "order_id"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    order: Mapped[Order] = relationship(back_populates="events", lazy="raise")


class OrderItem(TimestampMixin, Base):
    """Price snapshot: what the customer was charged stays fixed when the catalogue changes."""

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
    unit_price_cents: Mapped[int] = mapped_column(Integer)
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
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    provider: Mapped[str] = mapped_column(String(20))
    # The Stripe PaymentIntent id (`pi_...`): what webhooks refer to.
    provider_payment_id: Mapped[str] = mapped_column(String(100), unique=True)
    # Needed to hand the same PaymentIntent back when a checkout request is replayed. Cleared
    # once the payment is settled: it has no further use.
    client_secret: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20))
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    last_error: Mapped[str | None] = mapped_column(String(300))
    refund_id: Mapped[str | None] = mapped_column(String(100))

    order: Mapped[Order] = relationship(back_populates="payment", lazy="raise")


class StripeEvent(TimestampMixin, Base):
    """Every webhook event id we have processed. Inserted in the same transaction as the state
    change it caused, so an event is applied exactly once however often Stripe redelivers it."""

    __tablename__ = "stripe_events"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    type: Mapped[str] = mapped_column(String(100))
