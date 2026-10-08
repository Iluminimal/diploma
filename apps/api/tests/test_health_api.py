import pytest

from lookalike.core.config import Settings
from lookalike.ml.fake import FakeEmbedder

from .conftest import UNREACHABLE_DATABASE_URL, UNREACHABLE_REDIS_URL
from .helpers import running_app

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]


async def test_readyz_ok_against_real_dependencies(settings: Settings) -> None:
    async with running_app(settings) as (client, _):
        response = await client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {"database": "ok", "redis": "ok", "model": "ok"},
    }


@pytest.mark.parametrize(
    ("override", "failing"),
    [
        ({"redis_url": UNREACHABLE_REDIS_URL}, "redis"),
        ({"database_url": UNREACHABLE_DATABASE_URL}, "database"),
    ],
)
async def test_readyz_503_problem_when_dependency_is_down(
    settings: Settings, override: dict[str, str], failing: str
) -> None:
    async with running_app(settings.model_copy(update=override)) as (client, _):
        ready = await client.get("/readyz")
        live = await client.get("/healthz")

    body = ready.json()
    assert ready.status_code == 503
    assert ready.headers["content-type"] == "application/problem+json"
    assert body["checks"][failing] == "fail"
    assert body["request_id"] == ready.headers["x-request-id"]
    # Liveness must not depend on dependencies, or orchestrators restart-loop the pod.
    assert live.status_code == 200


async def test_readyz_503_until_the_model_is_loaded(settings: Settings) -> None:
    class NotLoaded(FakeEmbedder):
        def is_loaded(self) -> bool:
            return False

    async with running_app(settings, embedder=NotLoaded()) as (client, _):
        ready = await client.get("/readyz")
        live = await client.get("/healthz")

    assert ready.status_code == 503
    assert ready.json()["checks"]["model"] == "fail"
    assert live.status_code == 200
