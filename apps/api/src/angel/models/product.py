from decimal import Decimal

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base
from angel.models.mixins import TimestampMixin

EMBEDDING_DIMENSION = 512
# Tuned against exact search on the full catalogue (see docs/ml-pipeline.md).
HNSW_M = 16
HNSW_EF_CONSTRUCTION = 128


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price_cents >= 0", name="price_non_negative"),
        CheckConstraint("stock_quantity >= 0", name="stock_non_negative"),
        CheckConstraint("rating_count >= 0", name="rating_count_non_negative"),
        CheckConstraint("char_length(currency) = 3", name="currency_iso_length"),
        Index("ix_products_gender", "gender"),
        Index("ix_products_base_colour", "base_colour"),
        Index("ix_products_season", "season"),
        Index("ix_products_usage", "usage"),
        Index("ix_products_price_cents", "price_cents"),
        Index("ix_products_created_at", "created_at"),
        Index("ix_products_category_id", "category_id"),
        Index("ix_products_search_vector", "search_vector", postgresql_using="gin"),
        Index(
            "ix_products_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": HNSW_M, "ef_construction": HNSW_EF_CONSTRUCTION},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    # Id in the source dataset: the idempotency key for ingestion. NULL for products created
    # later through the admin area.
    source_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    slug: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(300))

    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    # Denormalized on purpose: filtered vector search must not need a join.
    gender: Mapped[str] = mapped_column(String(20))
    master_category: Mapped[str] = mapped_column(String(100))
    sub_category: Mapped[str] = mapped_column(String(100))
    article_type: Mapped[str] = mapped_column(String(100))
    base_colour: Mapped[str | None] = mapped_column(String(50))
    season: Mapped[str | None] = mapped_column(String(20))
    usage: Mapped[str | None] = mapped_column(String(50))
    year: Mapped[int | None] = mapped_column(SmallInteger)

    # Money as integer minor units (cents): no float rounding, matches Stripe.
    price_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), server_default="USD")
    stock_quantity: Mapped[int] = mapped_column(Integer, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    # Kept in step with the published reviews, in the same transaction that changes them.
    rating_average: Mapped[Decimal] = mapped_column(Numeric(3, 2), server_default="0")
    rating_count: Mapped[int] = mapped_column(Integer, server_default="0")

    # Storage key prefix: thumbnails live at `{image_key}_{400|800}.webp`.
    image_key: Mapped[str] = mapped_column(String(200))
    blur_data_url: Mapped[str | None] = mapped_column(Text)

    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSION))
    # Model revision + preprocessing that produced `embedding` (EmbeddingService.version).
    embedding_version: Mapped[str] = mapped_column(String(100))

    search_vector: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('english', name)", persisted=True)
    )
