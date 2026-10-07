"""products and categories

Revision ID: a1f3891fa86e
Revises: a6a98544cd4c
Create Date: 2026-10-07 16:22:50.131936

"""

from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1f3891fa86e"
down_revision: str | Sequence[str] | None = "a6a98544cd4c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("level", sa.SmallInteger(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("path", sa.String(length=400), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("level BETWEEN 1 AND 3", name=op.f("ck_categories_level_range")),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["categories.id"],
            name=op.f("fk_categories_parent_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_categories")),
        sa.UniqueConstraint("path", name=op.f("uq_categories_path")),
    )
    op.create_index(op.f("ix_categories_parent_id"), "categories", ["parent_id"], unique=False)
    op.create_table(
        "products",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("slug", sa.String(length=200), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("gender", sa.String(length=20), nullable=False),
        sa.Column("master_category", sa.String(length=100), nullable=False),
        sa.Column("sub_category", sa.String(length=100), nullable=False),
        sa.Column("article_type", sa.String(length=100), nullable=False),
        sa.Column("base_colour", sa.String(length=50), nullable=True),
        sa.Column("season", sa.String(length=20), nullable=True),
        sa.Column("usage", sa.String(length=50), nullable=True),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default="USD", nullable=False),
        sa.Column("stock_quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("image_key", sa.String(length=200), nullable=False),
        sa.Column("blur_data_url", sa.Text(), nullable=True),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(512), nullable=False),
        sa.Column("embedding_version", sa.String(length=100), nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', name)", persisted=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "char_length(currency) = 3", name=op.f("ck_products_currency_iso_length")
        ),
        sa.CheckConstraint("price_cents >= 0", name=op.f("ck_products_price_non_negative")),
        sa.CheckConstraint("stock_quantity >= 0", name=op.f("ck_products_stock_non_negative")),
        sa.ForeignKeyConstraint(
            ["category_id"],
            ["categories.id"],
            name=op.f("fk_products_category_id_categories"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_products")),
        sa.UniqueConstraint("slug", name=op.f("uq_products_slug")),
        sa.UniqueConstraint("source_id", name=op.f("uq_products_source_id")),
    )
    op.create_index("ix_products_base_colour", "products", ["base_colour"], unique=False)
    op.create_index("ix_products_category_id", "products", ["category_id"], unique=False)
    op.create_index("ix_products_created_at", "products", ["created_at"], unique=False)
    op.create_index(
        "ix_products_embedding_hnsw",
        "products",
        ["embedding"],
        unique=False,
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 128},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
    op.create_index("ix_products_gender", "products", ["gender"], unique=False)
    op.create_index("ix_products_price_cents", "products", ["price_cents"], unique=False)
    op.create_index(
        "ix_products_search_vector",
        "products",
        ["search_vector"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index("ix_products_season", "products", ["season"], unique=False)
    op.create_index("ix_products_usage", "products", ["usage"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_products_usage", table_name="products")
    op.drop_index("ix_products_season", table_name="products")
    op.drop_index("ix_products_search_vector", table_name="products", postgresql_using="gin")
    op.drop_index("ix_products_price_cents", table_name="products")
    op.drop_index("ix_products_gender", table_name="products")
    op.drop_index(
        "ix_products_embedding_hnsw",
        table_name="products",
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 128},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )
    op.drop_index("ix_products_created_at", table_name="products")
    op.drop_index("ix_products_category_id", table_name="products")
    op.drop_index("ix_products_base_colour", table_name="products")
    op.drop_table("products")
    op.drop_index(op.f("ix_categories_parent_id"), table_name="categories")
    op.drop_table("categories")
