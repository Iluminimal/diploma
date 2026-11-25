"""сагсны мөрд нэмэх үеийн үнэ: үнэ өөрчлөгдсөнийг мэдэгдэх

Revision ID: f2c7d4b8a315
Revises: e1b6c3a9d204
Create Date: 2026-11-27 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2c7d4b8a315"
down_revision: str | Sequence[str] | None = "e1b6c3a9d204"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    # Одоо байгаа мөрүүд NULL: тэдний үнэ өөрчлөгдсөнийг мэдэгдэхгүй (хуурамч мэдэгдэл үүсгэхгүй).
    op.add_column("cart_items", sa.Column("price_cents_at_add", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    op.drop_column("cart_items", "price_cents_at_add")
