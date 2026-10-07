import pytest
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import create_async_engine

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
