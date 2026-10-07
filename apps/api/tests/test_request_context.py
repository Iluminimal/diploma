from lookalike.core.config import Settings

from .helpers import running_app


async def test_generates_request_id(settings: Settings) -> None:
    async with running_app(settings) as (client, _):
        response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert len(response.headers["x-request-id"]) == 32


async def test_echoes_valid_inbound_request_id(settings: Settings) -> None:
    async with running_app(settings) as (client, _):
        response = await client.get("/healthz", headers={"X-Request-ID": "trace-abc-12345"})

    assert response.headers["x-request-id"] == "trace-abc-12345"


async def test_replaces_unsafe_inbound_request_id(settings: Settings) -> None:
    async with running_app(settings) as (client, _):
        too_short = await client.get("/healthz", headers={"X-Request-ID": "abc"})
        injected = await client.get("/healthz", headers={"X-Request-ID": 'x" injected="1 yyyyyy'})

    assert too_short.headers["x-request-id"] != "abc"
    assert injected.headers["x-request-id"] != 'x" injected="1 yyyyyy'
    assert len(injected.headers["x-request-id"]) == 32


async def test_cors_preflight_allows_configured_origin(settings: Settings) -> None:
    async with running_app(settings) as (client, _):
        response = await client.options(
            "/readyz",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
