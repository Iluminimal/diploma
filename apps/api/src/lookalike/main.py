import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.formparsers import MultiPartParser

from lookalike.api.routes import health
from lookalike.api.v1.router import router as v1_router
from lookalike.core.config import Settings, get_settings
from lookalike.core.errors import register_exception_handlers
from lookalike.core.logging import configure_logging, get_logger
from lookalike.core.request_context import REQUEST_ID_HEADER, RequestContextMiddleware
from lookalike.core.static import MediaFiles
from lookalike.core.uploads import BodySizeLimitMiddleware
from lookalike.db.engine import create_engine
from lookalike.ml.classifier import (
    CategoryClassifier,
    CategoryLabel,
    LazyCategoryClassifier,
    WholeImageLocalizer,
    ZeroShotCategoryClassifier,
)
from lookalike.ml.embeddings import EmbeddingService
from lookalike.ml.fashion_clip import FashionClipEmbedder, select_device
from lookalike.models import Category
from lookalike.repositories.categories import CategoryRepository
from lookalike.repositories.products import ProductRepository
from lookalike.services.cache import SearchCache
from lookalike.storage import LocalStorage

log = get_logger(__name__)


async def _load_embedder(settings: Settings) -> FashionClipEmbedder:
    embedder = FashionClipEmbedder(
        device=select_device(settings.embedding_device),
        fp16=settings.embedding_fp16,
        resize_mode=settings.embedding_resize_mode,
    )
    await asyncio.to_thread(embedder.load)
    return embedder


async def _warm_up(embedder: EmbeddingService) -> None:
    """The first forward pass compiles kernels (MPS) and allocates buffers: pay for it here,
    not in the first user's request."""
    await embedder.aembed_images([Image.new("RGB", (64, 64), "white")])
    await embedder.aembed_texts(["warm up"])


async def _warm_up_database(
    embedder: EmbeddingService, sessions: async_sessionmaker[AsyncSession]
) -> None:
    """One real similarity query: opens the first pooled connection and warms the index."""
    vector = (await embedder.aembed_texts(["warm up"]))[0]
    async with sessions() as session, session.begin():
        await ProductRepository(session).search_similar(vector, limit=1)


def _classifier_factory(
    embedder: EmbeddingService, sessions: async_sessionmaker[AsyncSession]
) -> Callable[[], Awaitable[CategoryClassifier]]:
    async def build() -> CategoryClassifier:
        async with sessions() as session, session.begin():
            categories = await CategoryRepository(session).searchable_article_types()
        # One label per article type: products are filtered by article type, and two prompts with
        # the same text would split the probability between them.
        unique: dict[str, Category] = {}
        for category in categories:  # most products first, so the main parent wins
            unique.setdefault(category.name, category)
        labels = [CategoryLabel(c.name, c.path, c.name) for c in unique.values()]
        return await ZeroShotCategoryClassifier.build(embedder, labels)

    return build


def create_app(
    settings: Settings | None = None, embedder: EmbeddingService | None = None
) -> FastAPI:
    """`embedder` is for tests: pass a ready-to-use model instead of loading FashionCLIP."""
    settings = settings or get_settings()
    configure_logging(settings.log_level, json_logs=settings.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.settings = settings
        app.state.engine = create_engine(settings.database_url)
        app.state.sessions = async_sessionmaker(app.state.engine, expire_on_commit=False)
        # Cache and rate-limit calls fail fast so a dead Redis cannot slow searches down.
        app.state.redis = Redis.from_url(
            settings.redis_url,
            socket_connect_timeout=settings.redis_op_timeout_seconds,
            socket_timeout=settings.redis_op_timeout_seconds,
        )
        app.state.storage = LocalStorage(settings.media_dir, settings.media_base_url)

        # The model is loaded once, here; /readyz stays red until it is. Inference later runs
        # on the embedder's own worker thread, never on the event loop.
        model = embedder or await _load_embedder(settings)
        await _warm_up(model)
        app.state.embedding_service = model
        app.state.localizer = WholeImageLocalizer()
        app.state.classifier = LazyCategoryClassifier(
            _classifier_factory(model, app.state.sessions)
        )
        app.state.search_cache = SearchCache(
            app.state.redis,
            embedding_version=model.version,
            dimension=model.dimension,
            text_ttl_seconds=settings.text_embedding_cache_ttl_seconds,
            similar_ttl_seconds=settings.similar_cache_ttl_seconds,
            filters_ttl_seconds=settings.catalog_filters_cache_ttl_seconds,
            timeout_seconds=settings.redis_op_timeout_seconds,
        )
        try:
            await app.state.classifier.get()
            await _warm_up_database(model, app.state.sessions)
        except Exception as exc:  # database not up yet: the first requests pay instead
            log.warning("database_warm_up_skipped", error=type(exc).__name__)
        log.info("startup", app_env=settings.app_env, embedding_version=model.version)
        try:
            yield
        finally:
            close = getattr(model, "close", None)
            if embedder is None and callable(close):
                await asyncio.to_thread(close)
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

    # Uploads up to the size limit stay in memory: Starlette would otherwise spool anything over
    # 1 MB to a temporary file on disk, and user photos must not be written anywhere unasked.
    MultiPartParser.spool_max_size = settings.max_upload_bytes + 1
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_file_bytes=settings.max_upload_bytes,
        api_prefix=settings.api_v1_prefix,
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
