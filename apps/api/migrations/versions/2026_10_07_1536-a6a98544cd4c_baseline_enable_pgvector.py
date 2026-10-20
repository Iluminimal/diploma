"""baseline: pgvector-ийг идэвхжүүлнэ

Revision ID: a6a98544cd4c
Revises:
Create Date: 2026-10-07 15:36:20.998618

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a6a98544cd4c"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Schema-г шинэчилнэ."""
    # hnsw.iterative_scan (шүүлттэй vector хайлт) pgvector >= 0.8 шаарддаг; суулгасан
    # хувилбарыг tests/core/test_database.py шалгадаг.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    """Schema-г өмнөх төлөвт буцаана."""
    op.execute("DROP EXTENSION IF EXISTS vector")
