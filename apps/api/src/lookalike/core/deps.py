from typing import Annotated

from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine

from lookalike.core.config import Settings
from lookalike.ml.embeddings import EmbeddingService
from lookalike.repositories.health import HealthRepository
from lookalike.services.health import HealthService


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_engine(request: Request) -> AsyncEngine:
    engine: AsyncEngine = request.app.state.engine
    return engine


def get_redis(request: Request) -> Redis:
    redis: Redis = request.app.state.redis
    return redis


def get_embedding_service(request: Request) -> EmbeddingService | None:
    embeddings: EmbeddingService | None = request.app.state.embedding_service
    return embeddings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_health_service(
    settings: SettingsDep,
    engine: Annotated[AsyncEngine, Depends(get_engine)],
    redis: Annotated[Redis, Depends(get_redis)],
    embeddings: Annotated[EmbeddingService | None, Depends(get_embedding_service)],
) -> HealthService:
    repository = HealthRepository(engine, redis, settings.readiness_timeout_seconds)
    return HealthService(repository, embeddings)


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
