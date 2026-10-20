"""захиалга биелүүлэлт: төлөв, tracking, event

Revision ID: c4a1d7e92b30
Revises: 5b8e2f61c0aa
Create Date: 2026-10-13 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4a1d7e92b30"
down_revision: str | Sequence[str] | None = "5b8e2f61c0aa"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_STATUSES = "status IN ('pending', 'paid', 'cancelled')"
NEW_STATUSES = "status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')"


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    op.drop_constraint(op.f("ck_orders_status_valid"), "orders", type_="check")
    op.create_check_constraint(op.f("ck_orders_status_valid"), "orders", NEW_STATUSES)
    op.add_column("orders", sa.Column("carrier", sa.String(length=40), nullable=True))
    op.add_column("orders", sa.Column("tracking_number", sa.String(length=100), nullable=True))
    op.add_column("orders", sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orders", sa.Column("refunded_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "order_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("order_id", sa.BigInteger(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column(
            "data",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("actor_id", sa.BigInteger(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["order_id"],
            ["orders.id"],
            name=op.f("fk_order_events_order_id_orders"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
            name=op.f("fk_order_events_actor_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_order_events")),
    )
    op.create_index("ix_order_events_order_id", "order_events", ["order_id"], unique=False)
    # Одоо байгаа захиалгад байх ёстой түүхийг нөхөж өгнө.
    op.execute(
        """
        INSERT INTO order_events (order_id, type, data, created_at, updated_at)
        SELECT id, 'placed', '{}'::jsonb, created_at, created_at FROM orders
        UNION ALL
        SELECT id, 'paid', '{}'::jsonb, paid_at, paid_at FROM orders WHERE paid_at IS NOT NULL
        UNION ALL
        SELECT id, 'cancelled', jsonb_build_object('reason', cancel_reason),
               cancelled_at, cancelled_at
        FROM orders WHERE cancelled_at IS NOT NULL
        """
    )


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    op.drop_index("ix_order_events_order_id", table_name="order_events")
    op.drop_table("order_events")
    # Хуучин schema-д биелүүлэлт байхгүй: илгээсэн, хүргэсэн захиалга төлөгдсөн байсан,
    # буцаан олгосон захиалга хэзээ ч үүсээгүй гэсэн үг.
    op.execute("UPDATE orders SET status = 'paid' WHERE status IN ('shipped', 'delivered')")
    op.execute(
        "UPDATE orders SET status = 'cancelled', "
        "cancel_reason = coalesce(cancel_reason, 'refunded'), "
        "cancelled_at = coalesce(cancelled_at, refunded_at, now()) WHERE status = 'refunded'"
    )
    for column in ("refunded_at", "delivered_at", "shipped_at", "tracking_number", "carrier"):
        op.drop_column("orders", column)
    op.drop_constraint(op.f("ck_orders_status_valid"), "orders", type_="check")
    op.create_check_constraint(op.f("ck_orders_status_valid"), "orders", OLD_STATUSES)
