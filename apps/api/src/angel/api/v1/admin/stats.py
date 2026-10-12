"""The dashboard's figures."""

from typing import Annotated

from fastapi import APIRouter, Query

from angel.core.deps import (
    AdminDashboardServiceDep,
)
from angel.schemas.admin.dashboard import (
    AdminStats,
    StatsQuery,
)

# Rate limit first so guessing tokens against the admin area is throttled; then the role check.

router = APIRouter()


@router.get("/stats", summary="The dashboard: figures for a period against the one before it")
async def stats(
    query: Annotated[StatsQuery, Query()], service: AdminDashboardServiceDep
) -> AdminStats:
    return await service.stats(query.days)
