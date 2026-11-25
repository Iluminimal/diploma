"""ажилтны үйлдлийн журнал

Revision ID: d7a2b9c4e815
Revises: c4e9a7b2d6f1
Create Date: 2026-11-26 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d7a2b9c4e815"
down_revision: str | Sequence[str] | None = "c4e9a7b2d6f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    op.create_table(
        "staff_audit_log",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
        sa.Column("actor_label", sa.String(length=320), nullable=False),
        sa.Column("action", sa.String(length=30), nullable=False),
        sa.Column("entity_type", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.String(length=40), nullable=False),
        sa.Column(
            "data",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_staff_audit_log_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_staff_audit_log")),
    )
    op.create_index(
        "ix_staff_audit_log_created_at", "staff_audit_log", [sa.text("created_at DESC")]
    )
    op.create_index(
        "ix_staff_audit_log_actor_created",
        "staff_audit_log",
        ["actor_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    op.drop_index("ix_staff_audit_log_actor_created", table_name="staff_audit_log")
    op.drop_index("ix_staff_audit_log_created_at", table_name="staff_audit_log")
    op.drop_table("staff_audit_log")
