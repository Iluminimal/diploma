from fastapi import APIRouter

from angel.core.deps import HealthServiceDep
from angel.schemas.health import LivenessResponse, ReadinessResponse
from angel.schemas.problem import ProblemDetail

# Unversioned on purpose: orchestrators probe these, clients do not.
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
