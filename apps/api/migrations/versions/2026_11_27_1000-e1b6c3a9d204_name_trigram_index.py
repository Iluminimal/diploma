"""барааны нэрийн trigram index: үсгийн алдаатай хайлт

Revision ID: e1b6c3a9d204
Revises: d7a2b9c4e815
Create Date: 2026-11-27 10:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1b6c3a9d204"
down_revision: str | Sequence[str] | None = "d7a2b9c4e815"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    # pg_trgm нь PostgreSQL-ийн хамт ирдэг, найдвартай (trusted) өргөтгөл: superuser шаардахгүй.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_index(
        "ix_products_name_trgm",
        "products",
        ["name"],
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    op.drop_index("ix_products_name_trgm", table_name="products", postgresql_using="gin")
