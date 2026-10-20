from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from angel.core.config import Settings
from angel.main import create_app
from angel.ml.embeddings import EmbeddingService
from angel.ml.fake import FakeEmbedder
from angel.payments import PaymentGateway


@asynccontextmanager
async def running_app(
    settings: Settings,
    *,
    embedder: EmbeddingService | None = None,
    payment_gateway: PaymentGateway | None = None,
    raise_app_exceptions: bool = True,
) -> AsyncIterator[tuple[AsyncClient, FastAPI]]:
    """Жинхэнэ апп-ыг (lifespan-тай) in-process HTTP client-ийн ард ажиллуулна.

    Model нь өөр өгөөгүй бол хурдан fake: тест FashionCLIP-ийг хэзээ ч татахгүй, ачаалахгүй.
    """
    app = create_app(settings, embedder=embedder or FakeEmbedder(), payment_gateway=payment_gateway)
    async with LifespanManager(app):
        transport = ASGITransport(app=app, raise_app_exceptions=raise_app_exceptions)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, app
