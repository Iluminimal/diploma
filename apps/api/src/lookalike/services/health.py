import asyncio
from http import HTTPStatus

from lookalike.core.errors import ProblemError
from lookalike.ml.embeddings import EmbeddingService
from lookalike.repositories.health import HealthRepository
from lookalike.schemas.health import CheckStatus, ReadinessResponse


class HealthService:
    def __init__(self, repository: HealthRepository, embeddings: EmbeddingService | None) -> None:
        self._repository = repository
        self._embeddings = embeddings

    async def readiness(self) -> ReadinessResponse:
        database_ok, redis_ok = await asyncio.gather(
            self._repository.database_ok(), self._repository.redis_ok()
        )
        checks: dict[str, CheckStatus] = {
            "database": "ok" if database_ok else "fail",
            "redis": "ok" if redis_ok else "fail",
            "model": self._model_status(),
        }
        if "fail" in checks.values():
            failing = sorted(name for name, value in checks.items() if value == "fail")
            raise ProblemError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "Service not ready",
                f"Failing checks: {', '.join(failing)}.",
                extensions={"checks": checks},
            )
        return ReadinessResponse(checks=checks)

    def _model_status(self) -> CheckStatus:
        # No model is configured until the search phase; once one is, it must be loaded.
        if self._embeddings is None:
            return "not_configured"
        return "ok" if self._embeddings.is_loaded() else "fail"
