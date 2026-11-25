"""бүртгэлийн аюулгүй байдлын үйл явдлын журнал

Revision ID: a9d3e5f7b126
Revises: f2c7d4b8a315
Create Date: 2026-11-28 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9d3e5f7b126"
down_revision: str | Sequence[str] | None = "f2c7d4b8a315"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    op.create_table(
        "security_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("method", sa.String(length=10), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_security_events_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_security_events")),
    )
    op.create_index(
        "ix_security_events_user_created",
        "security_events",
        ["user_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    op.drop_index("ix_security_events_user_created", table_name="security_events")
    op.drop_table("security_events")
