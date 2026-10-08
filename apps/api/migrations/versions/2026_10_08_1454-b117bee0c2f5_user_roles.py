"""user roles

Revision ID: b117bee0c2f5
Revises: fb91c6bdf945
Create Date: 2026-10-08 14:54:49.632424

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b117bee0c2f5"
down_revision: str | Sequence[str] | None = "fb91c6bdf945"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users", sa.Column("role", sa.String(length=20), server_default="customer", nullable=False)
    )
    # Alembic does not detect CHECK constraints, so this one is written by hand.
    op.create_check_constraint(
        op.f("ck_users_role_valid"), "users", "role IN ('customer', 'admin')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("ck_users_role_valid"), "users", type_="check")
    op.drop_column("users", "role")
