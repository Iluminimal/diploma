"""product reviews and denormalized ratings

Revision ID: d7e3b9a4f518
Revises: c4a1d7e92b30
Create Date: 2026-10-14 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7e3b9a4f518"
down_revision: str | Sequence[str] | None = "c4a1d7e92b30"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "products",
        sa.Column("rating_average", sa.Numeric(3, 2), server_default="0", nullable=False),
    )
    op.add_column(
        "products", sa.Column("rating_count", sa.Integer(), server_default="0", nullable=False)
    )
    op.create_check_constraint(
        op.f("ck_products_rating_count_non_negative"), "products", "rating_count >= 0"
    )
    op.create_table(
        "reviews",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("product_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=True),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=12), server_default="published", nullable=False),
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
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name=op.f("ck_reviews_rating_range")),
        sa.CheckConstraint(
            "status IN ('published', 'hidden')", name=op.f("ck_reviews_status_valid")
        ),
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_reviews_order_id_orders"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            ["products.id"],
            name=op.f("fk_reviews_product_id_products"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_reviews_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reviews")),
        sa.UniqueConstraint("product_id", "user_id", name=op.f("uq_reviews_product_id")),
    )
    op.create_index(
        "ix_reviews_product_status_created",
        "reviews",
        ["product_id", "status", "created_at"],
        unique=False,
    )
    op.create_index("ix_reviews_status_created", "reviews", ["status", "created_at"], unique=False)
    op.create_index("ix_reviews_user_id", "reviews", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_reviews_user_id", table_name="reviews")
    op.drop_index("ix_reviews_status_created", table_name="reviews")
    op.drop_index("ix_reviews_product_status_created", table_name="reviews")
    op.drop_table("reviews")
    op.drop_constraint(op.f("ck_products_rating_count_non_negative"), "products", type_="check")
    op.drop_column("products", "rating_count")
    op.drop_column("products", "rating_average")
