import asyncio
from http import HTTPStatus

from angel.core.errors import ProblemError
from angel.ml.embeddings import EmbeddingService
from angel.repositories.system.health import HealthRepository
from angel.schemas.system.health import CheckStatus, ReadinessResponse


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
        # Model-гүйгээр хайлт ажиллахгүй, тиймээс model бэлэн болтол pod ачаалал хүлээн авах ёсгүй.
        return "ok" if self._embeddings is not None and self._embeddings.is_loaded() else "fail"
