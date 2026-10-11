import os
import subprocess
import sys
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from lookalike.core.config import Settings
from lookalike.ml.fake import FakeEmbedder
from lookalike.payments import PaymentGateway
from tests.catalogue import Entry, seed_catalogue
from tests.helpers import running_app

WEBHOOK_SECRET = "whsec_test_secret"
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
        # CASCADE follows the foreign keys: users takes carts, orders, payments, addresses and
        # refresh tokens with it, products the cart, wishlist and order lines.
        await connection.execute(
            text("TRUNCATE users, products, categories, stripe_events RESTART IDENTITY CASCADE")
        )
    yield engine
    await engine.dispose()


# --- a running API on a small seeded catalogue ------------------------------------------------


@dataclass
class Api:
    client: AsyncClient
    app: FastAPI
    embedder: "FakeEmbedder"
    entries: list["Entry"]
    settings: Settings


ApiFactory = Callable[..., "AbstractAsyncContextManager[Api]"]


@pytest.fixture
async def api_factory(
    settings: Settings, migrated_database_url: str, db_engine: AsyncEngine
) -> ApiFactory:
    """`async with api_factory(rate_limit_text="2/60") as api:` starts the real app (fake model)
    on a freshly seeded catalogue. Settings overrides are keyword arguments. Rate limits are
    generous and the Redis prefix and embedding version unique, so tests never see each other."""

    @asynccontextmanager
    async def start(
        *,
        seed_count: int = 40,
        embedder: "FakeEmbedder | None" = None,
        gateway: PaymentGateway | None = None,
        **overrides: object,
    ) -> AsyncIterator[Api]:
        model = embedder or FakeEmbedder(version=f"fake-{uuid.uuid4().hex[:8]}")
        entries = await seed_catalogue(db_engine, model, seed_count) if seed_count else []
        values: dict[str, object] = {
            "database_url": migrated_database_url,
            "rate_limit_prefix": f"rl-test-{uuid.uuid4().hex[:8]}",
            "rate_limit_image": "10000/60",
            "rate_limit_text": "10000/60",
            "rate_limit_similar": "10000/60",
            "rate_limit_register": "10000/60",
            "rate_limit_login": "10000/60",
            "rate_limit_login_email": "10000/60",
            "rate_limit_refresh": "10000/60",
            "rate_limit_admin": "10000/60",
            "rate_limit_oauth": "10000/60",
            # Commerce: a fixed signing key, and the in-process payment gateway.
            "jwt_secret": "test-jwt-secret-0123456789-0123456789",
            "payments_mode": "offline",
            "stripe_webhook_secret": WEBHOOK_SECRET,
            "order_sweep_interval_seconds": 3600,
        }
        config = settings.model_copy(update={**values, **overrides})
        async with running_app(config, embedder=model, payment_gateway=gateway) as (client, app):
            yield Api(client, app, model, entries, config)

    return start


@pytest.fixture
async def api(api_factory: ApiFactory) -> AsyncIterator[Api]:
    async with api_factory() as running:
        yield running
