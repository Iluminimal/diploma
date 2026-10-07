from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from lookalike.api.routes import health
from lookalike.api.v1.router import router as v1_router
from lookalike.core.config import Settings, get_settings
from lookalike.core.errors import register_exception_handlers
from lookalike.core.logging import configure_logging, get_logger
from lookalike.core.request_context import REQUEST_ID_HEADER, RequestContextMiddleware
from lookalike.core.static import MediaFiles
from lookalike.db.engine import create_engine


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, json_logs=settings.log_json)
    log = get_logger(__name__)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        app.state.engine = create_engine(settings.database_url)
        app.state.redis = Redis.from_url(
            settings.redis_url, socket_connect_timeout=settings.readiness_timeout_seconds
        )
        # Set by the search phase once FashionCLIP is loaded here; None means "not configured".
        app.state.embedding_service = None
        log.info("startup", app_env=settings.app_env)
        try:
            yield
        finally:
            await app.state.redis.aclose()
            await app.state.engine.dispose()
            log.info("shutdown")

    app = FastAPI(
        title="Lookalike API",
        version="0.1.0",
        lifespan=lifespan,
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url=f"{settings.api_v1_prefix}/docs",
        redoc_url=None,
    )

    # Added last = outermost: CORS must see (and short-circuit) preflights before anything else.
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER],
    )

    register_exception_handlers(app)
    # Product thumbnails (dev). Starlette checks the folder on the first request, so make
    # sure it exists even before the first ingest.
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    app.mount(settings.media_url_path, MediaFiles(directory=settings.media_dir), name="media")
    app.include_router(health.router)
    app.include_router(v1_router, prefix=settings.api_v1_prefix)
    return app
