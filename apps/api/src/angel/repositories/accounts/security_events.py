from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from angel.models import RefreshToken
from angel.models.security import SecurityEvent


class SecurityEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(
        self,
        user_id: int,
        type_: str,
        *,
        method: str | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Мөрийг session-д нэмнэ; дуудсан transaction-тайгаа хамт commit хийгдэнэ."""
        self._session.add(
            SecurityEvent(user_id=user_id, type=type_, method=method, ip=ip, user_agent=user_agent)
        )

    async def recent(self, user_id: int, limit: int) -> list[SecurityEvent]:
        rows = await self._session.execute(
            select(SecurityEvent)
            .where(SecurityEvent.user_id == user_id)
            .order_by(SecurityEvent.created_at.desc(), SecurityEvent.id.desc())
            .limit(limit)
        )
        return list(rows.scalars())

    async def device_history(self, user_id: int, user_agent: str | None) -> tuple[bool, bool]:
        """(өмнө нь ямар нэг нэвтрэлт байсан уу, энэ user agent-ээр байсан уу). Refresh token-ууд
        нэвтрэлт бүрт үлддэг (дууссан ч), тиймээс "энэ төхөөрөмж урьд нь байсан уу" гэдгийг
        хэлж чадна."""
        any_before = (
            await self._session.execute(
                select(func.count())
                .select_from(RefreshToken)
                .where(RefreshToken.user_id == user_id)
            )
        ).scalar_one() > 0
        if not any_before or not user_agent:
            return any_before, False
        seen = (
            await self._session.execute(
                select(func.count())
                .select_from(RefreshToken)
                .where(RefreshToken.user_id == user_id, RefreshToken.user_agent == user_agent)
            )
        ).scalar_one() > 0
        return any_before, seen
