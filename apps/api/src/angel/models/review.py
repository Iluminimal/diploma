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
    """Худалдан авагчийн барааны үнэлгээ. Хэрэглэгч бүр бараа бүрт нэг; администратор нууж болно
    (зохиогчид үлдэх ч барааны хуудас, дунджаас хасагдана)."""

    __tablename__ = "reviews"
    __table_args__ = (
        # Хэрэглэгч бүр бараа бүрт нэг review.
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
    # Энэ хүнийг барааны худалдан авагч болгосон захиалга (админы лавлагаанд хадгална).
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"))
    rating: Mapped[int] = mapped_column(SmallInteger)
    title: Mapped[str | None] = mapped_column(String(120))
    body: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), server_default="published")
