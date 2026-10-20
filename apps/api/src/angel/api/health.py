from fastapi import APIRouter

from angel.core.deps import HealthServiceDep
from angel.schemas.problem import ProblemDetail
from angel.schemas.system.health import LivenessResponse, ReadinessResponse

# Зориуд version-гүй: orchestrator-ууд шалгадаг, client-ууд ашигладаггүй.
router = APIRouter(tags=["health"])


@router.get("/healthz", summary="Liveness probe")
async def healthz() -> LivenessResponse:
    return LivenessResponse()


@router.get(
    "/readyz",
    summary="Readiness probe (database, Redis, model)",
    responses={503: {"model": ProblemDetail, "description": "A dependency is failing"}},
)
async def readyz(service: HealthServiceDep) -> ReadinessResponse:
    return await service.readiness()
