import os
import subprocess
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from lookalike.core.config import Settings

UNREACHABLE_DATABASE_URL = "postgresql+asyncpg://nobody:nobody@127.0.0.1:1/nothing"
UNREACHABLE_REDIS_URL = "redis://127.0.0.1:1/0"


@pytest.fixture
def settings() -> Settings:
    """Settings from the environment / .env (the dev infra), with quiet logs."""
    return Settings(app_env="test", log_level="WARNING", readiness_timeout_seconds=1.0)


@pytest.fixture
async def require_infra(settings: Settings) -> None:
    """Fail loudly (never skip) when Postgres/Redis are unreachable."""
    engine = create_async_engine(settings.database_url)
    redis = Redis.from_url(settings.redis_url, socket_connect_timeout=2)
    try:
        async with engine.connect():
            pass
        await redis.ping()
    except Exception as exc:
        pytest.fail(f"Postgres/Redis unreachable ({type(exc).__name__}). Run `make infra` first.")
    finally:
        await redis.aclose()
        await engine.dispose()


# --- throwaway database for tests that write catalogue data -----------------------------------
# Ingestion tests must never touch the dev catalogue, so they get their own migrated database.

API_ROOT = Path(__file__).resolve().parents[1]


def _alembic(database_url: str, *args: str) -> None:
    env = {**os.environ, "DATABASE_URL": database_url}
    result = subprocess.run(  # noqa: S603 - fixed arguments, no user input
        [sys.executable, "-m", "alembic", *args],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, f"alembic {' '.join(args)} failed:\n{result.stderr}"


@asynccontextmanager
async def scratch_database(settings: Settings, suffix: str) -> AsyncIterator[str]:
    base = make_url(settings.database_url)
    name = f"{base.database}_{suffix}"
    admin = create_async_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    try:
        async with admin.connect() as connection:
            await connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
            await connection.execute(text(f'CREATE DATABASE "{name}"'))
        yield base.set(database=name).render_as_string(hide_password=False)
    finally:
        async with admin.connect() as connection:
            await connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        await admin.dispose()


@pytest.fixture(scope="session")
async def migrated_database_url() -> AsyncIterator[str]:
    """A fresh database migrated to head with the real Alembic migrations."""
    # Unreachable infra fails here, loudly, like `require_infra` does for the other tests.
    async with scratch_database(Settings(app_env="test"), "test") as url:
        _alembic(url, "upgrade", "head")
        yield url


@pytest.fixture
async def db_engine(migrated_database_url: str) -> AsyncIterator[AsyncEngine]:
    """Engine on the test database with empty catalogue tables."""
    engine = create_async_engine(migrated_database_url)
    async with engine.begin() as connection:
        await connection.execute(text("TRUNCATE products, categories RESTART IDENTITY CASCADE"))
    yield engine
    await engine.dispose()
