"""baseline: enable pgvector

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
    """Upgrade schema."""
    # hnsw.iterative_scan (filtered vector search) needs pgvector >= 0.8; the integration
    # test tests/test_database.py asserts the installed version.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP EXTENSION IF EXISTS vector")
