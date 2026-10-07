from collections.abc import AsyncIterator
from http import HTTPStatus
from typing import Annotated

from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from lookalike.core.config import Settings
from lookalike.core.errors import ProblemError
from lookalike.ml.classifier import GarmentLocalizer, LazyCategoryClassifier
from lookalike.ml.embeddings import EmbeddingService
from lookalike.repositories.health import HealthRepository
from lookalike.services.cache import SearchCache
from lookalike.services.catalog import CatalogService
from lookalike.services.health import HealthService
from lookalike.services.search import SearchService
from lookalike.storage import Storage


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


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    sessions: async_sessionmaker[AsyncSession] = request.app.state.sessions
    async with sessions() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_storage(request: Request) -> Storage:
    storage: Storage = request.app.state.storage
    return storage


StorageDep = Annotated[Storage, Depends(get_storage)]


def get_health_service(
    settings: SettingsDep,
    engine: Annotated[AsyncEngine, Depends(get_engine)],
    redis: Annotated[Redis, Depends(get_redis)],
    embeddings: Annotated[EmbeddingService | None, Depends(get_embedding_service)],
) -> HealthService:
    repository = HealthRepository(engine, redis, settings.readiness_timeout_seconds)
    return HealthService(repository, embeddings)


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]


def get_search_service(
    request: Request, settings: SettingsDep, session: SessionDep, storage: StorageDep
) -> SearchService:
    embedder: EmbeddingService | None = request.app.state.embedding_service
    if embedder is None or not embedder.is_loaded():
        raise ProblemError(
            HTTPStatus.SERVICE_UNAVAILABLE, "Search unavailable", "The model is not loaded yet."
        )
    classifier: LazyCategoryClassifier = request.app.state.classifier
    localizer: GarmentLocalizer = request.app.state.localizer
    cache: SearchCache = request.app.state.search_cache
    return SearchService(
        session=session,
        embedder=embedder,
        classifier=classifier,
        localizer=localizer,
        cache=cache,
        storage=storage,
        max_upload_pixels=settings.max_upload_pixels,
        default_limit=settings.search_default_limit,
        hybrid_text_weight=settings.hybrid_text_weight,
        detected_categories=settings.detected_categories,
    )


SearchServiceDep = Annotated[SearchService, Depends(get_search_service)]


def get_catalog_service(
    request: Request, session: SessionDep, storage: StorageDep
) -> CatalogService:
    cache: SearchCache = request.app.state.search_cache
    return CatalogService(session, storage, cache)


CatalogServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]
