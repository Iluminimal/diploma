from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from angel.db.base import Base
from angel.models.mixins import TimestampMixin


class Cart(TimestampMixin, Base):
    """Нэвтэрсэн хэрэглэгчийн (`user_id`) эсвэл зочны (`guest_token_hash`, `lk_cart` cookie-ийн
    SHA-256) сагс. Нэвтрэхэд зочны сагсыг хэрэглэгчийнхтэй нэгтгэж устгана."""

    __tablename__ = "carts"
    __table_args__ = (
        CheckConstraint("num_nonnulls(user_id, guest_token_hash) = 1", name="one_owner"),
        # Зочны сагсыг насаар нь цэвэрлэнэ.
        Index("ix_carts_updated_at", "updated_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    guest_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)

    items: Mapped[list["CartItem"]] = relationship(
        back_populates="cart", order_by="CartItem.id", lazy="raise", cascade="all, delete-orphan"
    )


class CartItem(TimestampMixin, Base):
    __tablename__ = "cart_items"
    __table_args__ = (
        UniqueConstraint("cart_id", "product_id", "size"),
        CheckConstraint("quantity BETWEEN 1 AND 99", name="quantity_range"),
        Index("ix_cart_items_product_id", "product_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    cart_id: Mapped[int] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    # Size-гүй бараанд "": NULL нь дээрх unique constraint-ийг хоосолчихно.
    size: Mapped[str] = mapped_column(String(16), server_default="")
    quantity: Mapped[int] = mapped_column(SmallInteger)

    cart: Mapped[Cart] = relationship(back_populates="items", lazy="raise")


class WishlistItem(TimestampMixin, Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
