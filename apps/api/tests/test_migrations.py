import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from lookalike.core.config import Settings
from tests.conftest import _alembic, scratch_database

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]


async def test_migrations_apply_roll_back_and_reapply(settings: Settings) -> None:
    async with scratch_database(settings, "migrations") as url:
        engine = create_async_engine(url)

        async def tables() -> set[str]:
            async with engine.connect() as connection:
                rows = await connection.execute(
                    text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
                )
                return {r[0] for r in rows}

        try:
            _alembic(url, "upgrade", "head")
            assert {"products", "categories"} <= await tables()
            _alembic(url, "check")  # models and migrations agree
            _alembic(url, "downgrade", "base")
            assert not ({"products", "categories"} & await tables())
            _alembic(url, "upgrade", "head")
            assert {"products", "categories"} <= await tables()
        finally:
            await engine.dispose()
