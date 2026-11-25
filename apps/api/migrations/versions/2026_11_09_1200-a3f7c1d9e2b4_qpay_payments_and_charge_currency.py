"""QPay: payments дээр түгжсэн төлбөрийн дүн/валют/ханш ба provider_data; Stripe-ийн үлдэгдлийг авах

Revision ID: a3f7c1d9e2b4
Revises: e5b2c8a41d07
Create Date: 2026-11-09 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a3f7c1d9e2b4"
down_revision: str | Sequence[str] | None = "e5b2c8a41d07"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    op.rename_table("stripe_events", "payment_events")
    op.execute("ALTER TABLE payment_events RENAME CONSTRAINT pk_stripe_events TO pk_payment_events")

    op.add_column("payments", sa.Column("charge_currency", sa.String(length=3), nullable=True))
    op.add_column("payments", sa.Column("charge_minor", sa.BigInteger(), nullable=True))
    op.add_column("payments", sa.Column("exchange_rate", sa.Numeric(14, 6), nullable=True))
    op.add_column(
        "payments",
        sa.Column("provider_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # Өмнөх төлбөрүүд (offline) захиалгын валютаараа, 1:1 ханшаар авагдсан.
    op.execute(
        "UPDATE payments SET charge_currency = currency, charge_minor = amount_cents, "
        "exchange_rate = 1"
    )
    op.alter_column("payments", "charge_currency", nullable=False)
    op.alter_column("payments", "charge_minor", nullable=False)
    op.alter_column("payments", "exchange_rate", nullable=False)
    op.create_check_constraint(
        op.f("ck_payments_charge_non_negative"), "payments", "charge_minor >= 0"
    )
    op.drop_column("payments", "client_secret")


def downgrade() -> None:
    """Schema-г буцаана."""
    op.add_column("payments", sa.Column("client_secret", sa.String(length=200), nullable=True))
    op.drop_constraint(op.f("ck_payments_charge_non_negative"), "payments", type_="check")
    op.drop_column("payments", "provider_data")
    op.drop_column("payments", "exchange_rate")
    op.drop_column("payments", "charge_minor")
    op.drop_column("payments", "charge_currency")
    op.execute("ALTER TABLE payment_events RENAME CONSTRAINT pk_payment_events TO pk_stripe_events")
    op.rename_table("payment_events", "stripe_events")
