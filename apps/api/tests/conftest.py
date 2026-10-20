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

from angel.core.config import Settings
from angel.ml.fake import FakeEmbedder
from angel.payments import PaymentGateway
from tests.support.catalogue import Entry, seed_catalogue
from tests.support.helpers import running_app

WEBHOOK_SECRET = "whsec_test_secret"
UNREACHABLE_DATABASE_URL = "postgresql+asyncpg://nobody:nobody@127.0.0.1:1/nothing"
UNREACHABLE_REDIS_URL = "redis://127.0.0.1:1/0"


@pytest.fixture
def settings() -> Settings:
    """.env болон орчноос авсан Settings (dev infra), log чимээгүй."""
    return Settings(app_env="test", log_level="WARNING", readiness_timeout_seconds=1.0)


@pytest.fixture
async def require_infra(settings: Settings) -> None:
    """Postgres/Redis холбогдохгүй бол алгасахгүй, шууд fail болгоно."""
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


# --- каталог бичдэг тестэд зориулсан түр database ---------------------------------------------
# Ingestion тест dev каталогт хэзээ ч хүрэхгүй, тиймээс өөрийн migrate хийсэн database авна.

API_ROOT = Path(__file__).resolve().parents[1]


def _alembic(database_url: str, *args: str) -> None:
    env = {**os.environ, "DATABASE_URL": database_url}
    result = subprocess.run(  # noqa: S603 - тогтмол аргумент, хэрэглэгчийн оролтгүй
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
    """Жинхэнэ Alembic migration-ээр head хүртэл migrate хийсэн шинэ database."""
    # Infra холбогдохгүй бол энд шууд fail болно, бусад тестийн `require_infra`-тай адил.
    async with scratch_database(Settings(app_env="test"), "test") as url:
        _alembic(url, "upgrade", "head")
        yield url


@pytest.fixture
async def db_engine(migrated_database_url: str) -> AsyncIterator[AsyncEngine]:
    """Тестийн database-ийн engine, каталогийн хүснэгтүүд хоосон."""
    engine = create_async_engine(migrated_database_url)
    async with engine.begin() as connection:
        # CASCADE нь foreign key-г дагана: users-тэй хамт cart, order, payment, address,
        # refresh token, products-тай хамт cart, wishlist, захиалгын мөр устана.
        await connection.execute(
            text("TRUNCATE users, products, categories, stripe_events RESTART IDENTITY CASCADE")
        )
    yield engine
    await engine.dispose()


# --- жижиг seed хийсэн каталогтой ажиллаж буй API ---------------------------------------------


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
    """`async with api_factory(rate_limit_text="2/60") as api:` жинхэнэ апп-ыг (fake model-той)
    шинээр seed хийсэн каталог дээр ажиллуулна. Settings-ийг keyword аргументаар дарна. Rate limit
    сул, Redis prefix ба embedding version давтагдашгүй тул тестүүд бие биедээ нөлөөлөхгүй.
    """

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
            "rate_limit_otp_send": "10000/60",
            "rate_limit_otp_verify": "10000/60",
            # Тестэд кодын хооронд хүлээхгүй (cooldown-д тусдаа тест бий).
            "otp_resend_seconds": 0,
            "otp_max_sends_per_hour": 1000,
            "otp_dev_code": "",
            "sms_mode": "console",
            "default_phone_region": "US",
            # .env юу гэсэн ч (preview fake ашиглаж болно) тест Google унтраасан эхэлнэ.
            "oauth_mode": "google",
            "google_client_id": "",
            "google_client_secret": "",
            # Commerce: тогтмол signing key ба in-process payment gateway.
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
