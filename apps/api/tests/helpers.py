from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from lookalike.core.config import Settings
from lookalike.main import create_app


@asynccontextmanager
async def running_app(
    settings: Settings, *, raise_app_exceptions: bool = True
) -> AsyncIterator[tuple[AsyncClient, FastAPI]]:
    """Run the real app (lifespan included) behind an in-process HTTP client."""
    app = create_app(settings)
    async with LifespanManager(app):
        transport = ASGITransport(app=app, raise_app_exceptions=raise_app_exceptions)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client, app
