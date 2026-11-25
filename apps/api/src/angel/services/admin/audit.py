import math

from sqlalchemy.ext.asyncio import AsyncSession

from angel.models.audit import StaffAuditLog
from angel.repositories.admin.audit import AuditRepository
from angel.schemas.admin.audit import AuditEntry, AuditListQuery, AuditPage


def to_audit_entry(row: StaffAuditLog) -> AuditEntry:
    return AuditEntry(
        id=row.id,
        actor_id=row.actor_id,
        actor_label=row.actor_label,
        action=row.action,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        data=row.data,
        created_at=row.created_at,
    )


class AdminAuditService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._audit = AuditRepository(session)

    async def list(self, query: AuditListQuery) -> AuditPage:
        async with self._session.begin():
            rows, total = await self._audit.list(
                actor_id=query.actor_id,
                entity_type=query.entity_type,
                action=query.action,
                limit=query.page_size,
                offset=(query.page - 1) * query.page_size,
            )
        return AuditPage(
            items=[to_audit_entry(row) for row in rows],
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
        )
