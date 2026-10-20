from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base
from angel.models.mixins import TimestampMixin


class Review(TimestampMixin, Base):
    """A buyer's rating of a product. One per user per product; an administrator can hide it
    (it then stays with its author but leaves the product page and the average)."""

    __tablename__ = "reviews"
    __table_args__ = (
        # One review per user per product.
        UniqueConstraint("product_id", "user_id"),
        CheckConstraint("rating BETWEEN 1 AND 5", name="rating_range"),
        CheckConstraint("status IN ('published', 'hidden')", name="status_valid"),
        Index("ix_reviews_product_status_created", "product_id", "status", "created_at"),
        Index("ix_reviews_status_created", "status", "created_at"),
        Index("ix_reviews_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # The order that made this person a buyer of the product (kept for the admin's reference).
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    rating: Mapped[int] = mapped_column(SmallInteger)
    title: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), server_default="published")
