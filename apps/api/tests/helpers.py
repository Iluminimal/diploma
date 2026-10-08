from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from lookalike.core.config import Settings
from lookalike.main import create_app
from lookalike.ml.embeddings import EmbeddingService
from lookalike.ml.fake import FakeEmbedder
from lookalike.payments import PaymentGateway


@asynccontextmanager
async def running_app(
    settings: Settings,
    *,
    embedder: EmbeddingService | None = None,
    payment_gateway: PaymentGateway | None = None,
    raise_app_exceptions: bool = True,
) -> AsyncIterator[tuple[AsyncClient, FastAPI]]:
    """Run the real app (lifespan included) behind an in-process HTTP client.

    The model is a fast fake unless one is passed: tests never download or load FashionCLIP.
    """
    app = create_app(settings, embedder=embedder or FakeEmbedder(), payment_gateway=payment_gateway)
    async with LifespanManager(app):
        transport = ASGITransport(app=app, raise_app_exceptions=raise_app_exceptions)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, app
