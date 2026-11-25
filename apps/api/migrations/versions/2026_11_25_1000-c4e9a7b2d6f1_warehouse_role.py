"""агуулахын ажилтны role

Revision ID: c4e9a7b2d6f1
Revises: b8d4e6a1c3f2
Create Date: 2026-11-25 10:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e9a7b2d6f1"
down_revision: str | Sequence[str] | None = "b8d4e6a1c3f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    # Alembic CHECK constraint-ийг илрүүлдэггүй тул гараар бичсэн.
    op.drop_constraint(op.f("ck_users_role_valid"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_role_valid"), "users", "role IN ('customer', 'admin', 'warehouse')"
    )


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    # Агуулахын ажилтнуудыг хэрэглэгч болгож буцаана: тэгэхгүй бол өмнөх constraint хэрэгжихгүй.
    op.execute("UPDATE users SET role = 'customer' WHERE role = 'warehouse'")
    op.drop_constraint(op.f("ck_users_role_valid"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_role_valid"), "users", "role IN ('customer', 'admin')"
    )
