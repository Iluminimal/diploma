"""хэрэглэгчийн avatar

Revision ID: 5b8e2f61c0aa
Revises: 9d4c1e7a3b55
Create Date: 2026-10-12 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5b8e2f61c0aa"
down_revision: str | Sequence[str] | None = "9d4c1e7a3b55"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    op.drop_column("users", "avatar_url")
