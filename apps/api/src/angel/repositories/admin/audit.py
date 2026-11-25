"""Ажилтны үйлдлийн журнал: нэмэх, шүүж унших. Засах, устгах байхгүй."""

from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from angel.models import User
from angel.models.audit import StaffAuditLog


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def record(
        self,
        actor: User,
        action: str,
        entity_type: str,
        entity_id: int | str,
        data: dict[str, Any] | None = None,
    ) -> None:
        """Мөрийг session-д нэмнэ. Дуудсан transaction-тайгаа хамт commit хийгдэнэ."""
        self._session.add(
            StaffAuditLog(
                actor_id=actor.id,
                actor_label=actor.identifier,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id),
                data=data or {},
            )
        )

    async def list(
        self,
        *,
        actor_id: int | None,
        entity_type: str | None,
        action: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[StaffAuditLog], int]:
        clauses: list[ColumnElement[bool]] = []
        if actor_id is not None:
            clauses.append(StaffAuditLog.actor_id == actor_id)
        if entity_type is not None:
            clauses.append(StaffAuditLog.entity_type == entity_type)
        if action is not None:
            clauses.append(StaffAuditLog.action == action)
        total = (
            await self._session.execute(
                select(func.count()).select_from(StaffAuditLog).where(*clauses)
            )
        ).scalar_one()
        rows = await self._session.execute(
            select(StaffAuditLog)
            .where(*clauses)
            .order_by(StaffAuditLog.created_at.desc(), StaffAuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(rows.scalars()), int(total)
