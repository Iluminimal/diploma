import asyncio
from collections.abc import Awaitable

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from lookalike.core.logging import get_logger

log = get_logger(__name__)


class HealthRepository:
    """Connectivity probes. Each returns False instead of raising so a dead dependency is
    reported, not turned into a 500."""

    def __init__(self, engine: AsyncEngine, redis: Redis, timeout: float) -> None:
        self._engine = engine
        self._redis = redis
        self._timeout = timeout

    async def database_ok(self) -> bool:
        async def probe() -> None:
            async with self._engine.connect() as connection:
                await connection.execute(text("SELECT 1"))

        return await self._guard("database", probe())

    async def redis_ok(self) -> bool:
        return await self._guard("redis", self._redis.ping())

    async def _guard(self, name: str, probe: Awaitable[object]) -> bool:
        try:
            await asyncio.wait_for(probe, self._timeout)
        except Exception as exc:
            log.warning("readiness_probe_failed", dependency=name, error=type(exc).__name__)
            return False
        return True
