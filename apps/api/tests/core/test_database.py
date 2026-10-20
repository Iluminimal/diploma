import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from angel.core.config import Settings

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]


async def test_pgvector_is_installed_with_iterative_scan_support(settings: Settings) -> None:
    """Baseline migration pgvector-ийг идэвхжүүлнэ; hnsw.iterative_scan-д >= 0.8 хэрэгтэй."""
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as connection:
            version = (
                await connection.execute(
                    text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
                )
            ).scalar_one_or_none()
            assert version is not None, "pgvector missing: run `make migrate`"
            major, minor, *_ = (int(part) for part in version.split("."))
            assert (major, minor) >= (0, 8)

            # Суулгасан хувилбар дэмжсэн үед л энэ тохиргоо байна.
            await connection.execute(text("SET hnsw.iterative_scan = relaxed_order"))
    finally:
        await engine.dispose()
