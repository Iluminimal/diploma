"""phone login: users.phone, otp challenges, session metadata

Revision ID: e5b2c8a41d07
Revises: d7e3b9a4f518
Create Date: 2026-10-15 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5b2c8a41d07"
down_revision: str | Sequence[str] | None = "d7e3b9a4f518"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "otp_challenges",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("purpose", sa.String(length=20), nullable=False),
        sa.Column("destination", sa.String(length=320), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "purpose IN ('login', 'verify_email', 'verify_phone', 'change_email', "
            "'change_phone', 'reset_password')",
            name=op.f("ck_otp_challenges_purpose_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_otp_challenges_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_otp_challenges")),
    )
    op.create_index(
        "ix_otp_challenges_destination", "otp_challenges", ["destination", "purpose"], unique=False
    )
    op.add_column("refresh_tokens", sa.Column("user_agent", sa.String(length=300), nullable=True))
    op.add_column("refresh_tokens", sa.Column("ip", sa.String(length=45), nullable=True))
    op.add_column(
        "refresh_tokens", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("users", sa.Column("phone", sa.String(length=16), nullable=True))
    op.add_column(
        "users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "users", sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.alter_column("users", "email", existing_type=sa.VARCHAR(length=320), nullable=True)
    op.create_unique_constraint(op.f("uq_users_phone"), "users", ["phone"])
    op.create_check_constraint(
        op.f("ck_users_phone_e164"), "users", r"phone ~ '^\+[1-9][0-9]{7,14}$'"
    )
    op.create_check_constraint(
        op.f("ck_users_contact_present"), "users", "email IS NOT NULL OR phone IS NOT NULL"
    )
    # Google vouches for the address it signs people in with.
    op.execute(
        "UPDATE users SET email_verified_at = now() "
        "WHERE id IN (SELECT user_id FROM oauth_identities WHERE provider = 'google')"
    )


def downgrade() -> None:
    """Downgrade schema. Fails if an account without an email exists: those cannot be kept."""
    op.drop_constraint(op.f("ck_users_contact_present"), "users", type_="check")
    op.drop_constraint(op.f("ck_users_phone_e164"), "users", type_="check")
    op.drop_constraint(op.f("uq_users_phone"), "users", type_="unique")
    op.alter_column("users", "email", existing_type=sa.VARCHAR(length=320), nullable=False)
    op.drop_column("users", "phone_verified_at")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "phone")
    op.drop_column("refresh_tokens", "last_used_at")
    op.drop_column("refresh_tokens", "ip")
    op.drop_column("refresh_tokens", "user_agent")
    op.drop_index("ix_otp_challenges_destination", table_name="otp_challenges")
    op.drop_table("otp_challenges")
