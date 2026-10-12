from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from angel.models import OtpChallenge


class OtpRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        *,
        purpose: str,
        destination: str,
        user_id: int | None,
        code_hash: str,
        expires_at: datetime,
    ) -> OtpChallenge:
        challenge = OtpChallenge(
            purpose=purpose,
            destination=destination,
            user_id=user_id,
            code_hash=code_hash,
            expires_at=expires_at,
        )
        self._session.add(challenge)
        await self._session.flush()
        return challenge

    async def latest(self, purpose: str, destination: str) -> OtpChallenge | None:
        """The newest challenge for this purpose and destination, used or not (resend cooldown)."""
        result = await self._session.execute(
            select(OtpChallenge)
            .where(OtpChallenge.purpose == purpose, OtpChallenge.destination == destination)
            .order_by(OtpChallenge.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def latest_open_for_update(self, purpose: str, destination: str) -> OtpChallenge | None:
        """The newest challenge that was not used yet, locked: two guesses at the same moment are
        counted one after the other."""
        result = await self._session.execute(
            select(OtpChallenge)
            .where(
                OtpChallenge.purpose == purpose,
                OtpChallenge.destination == destination,
                OtpChallenge.consumed_at.is_(None),
            )
            .order_by(OtpChallenge.id.desc())
            .limit(1)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def count_since(self, destination: str, since: datetime) -> int:
        result = await self._session.execute(
            select(func.count())
            .select_from(OtpChallenge)
            .where(OtpChallenge.destination == destination, OtpChallenge.created_at >= since)
        )
        return int(result.scalar_one())

    async def consume_open(self, purpose: str, destination: str, now: datetime) -> None:
        """A new code replaces the older ones: only the newest can be used."""
        await self._session.execute(
            update(OtpChallenge)
            .where(
                OtpChallenge.purpose == purpose,
                OtpChallenge.destination == destination,
                OtpChallenge.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )
