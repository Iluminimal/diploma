import pytest

from lookalike.core.errors import ProblemError
from lookalike.services.health import HealthService


class FakeRepository:
    def __init__(self, *, database: bool = True, redis: bool = True) -> None:
        self._database = database
        self._redis = redis

    async def database_ok(self) -> bool:
        return self._database

    async def redis_ok(self) -> bool:
        return self._redis


class FakeEmbeddings:
    dimension = 512

    def __init__(self, *, loaded: bool) -> None:
        self._loaded = loaded

    def is_loaded(self) -> bool:
        return self._loaded


def service(repo: FakeRepository, embeddings: FakeEmbeddings | None = None) -> HealthService:
    return HealthService(repo, embeddings)  # type: ignore[arg-type]


async def test_ready_with_loaded_model() -> None:
    result = await service(FakeRepository(), FakeEmbeddings(loaded=True)).readiness()
    assert result.checks == {"database": "ok", "redis": "ok", "model": "ok"}


@pytest.mark.parametrize(
    ("repo", "embeddings", "failing"),
    [
        (FakeRepository(database=False), FakeEmbeddings(loaded=True), "database"),
        (FakeRepository(redis=False), FakeEmbeddings(loaded=True), "redis"),
        (FakeRepository(), FakeEmbeddings(loaded=False), "model"),
        (FakeRepository(), None, "model"),
    ],
)
async def test_not_ready_when_a_check_fails(
    repo: FakeRepository, embeddings: FakeEmbeddings | None, failing: str
) -> None:
    with pytest.raises(ProblemError) as raised:
        await service(repo, embeddings).readiness()

    assert raised.value.status_code == 503
    assert raised.value.extensions["checks"][failing] == "fail"
    assert failing in (raised.value.detail or "")
