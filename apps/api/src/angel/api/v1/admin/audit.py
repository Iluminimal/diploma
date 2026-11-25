"""Ажилтны үйлдлийн журнал: админ л харна."""

from typing import Annotated

from fastapi import APIRouter, Query

from angel.core.deps import AdminAuditServiceDep
from angel.schemas.admin.audit import AuditListQuery, AuditPage

# Rate limit, role шалгалт нь __init__.py дахь router-т нэг дор хийгддэг.

router = APIRouter()


@router.get("/audit", summary="Who changed what, newest first")
async def audit_log(
    query: Annotated[AuditListQuery, Query()], service: AdminAuditServiceDep
) -> AuditPage:
    return await service.list(query)
