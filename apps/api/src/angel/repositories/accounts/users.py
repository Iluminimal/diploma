import uuid
from datetime import datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from angel.models import Address, OAuthIdentity, RefreshToken, User
from angel.models.user import ROLE_CUSTOMER


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: int) -> User | None:
        return await self._session.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_phone(self, phone: str) -> User | None:
        result = await self._session.execute(select(User).where(User.phone == phone))
        return result.scalar_one_or_none()

    async def providers(self, user_id: int) -> list[str]:
        result = await self._session.execute(
            select(OAuthIdentity.provider)
            .where(OAuthIdentity.user_id == user_id)
            .order_by(OAuthIdentity.provider)
        )
        return list(result.scalars())

    async def get_by_identity(self, provider: str, subject: str) -> User | None:
        result = await self._session.execute(
            select(User)
            .join(OAuthIdentity, OAuthIdentity.user_id == User.id)
            .where(OAuthIdentity.provider == provider, OAuthIdentity.subject == subject)
        )
        return result.scalar_one_or_none()

    async def add_identity(
        self, *, user_id: int, provider: str, subject: str, email: str
    ) -> OAuthIdentity:
        identity = OAuthIdentity(user_id=user_id, provider=provider, subject=subject, email=email)
        self._session.add(identity)
        await self._session.flush()
        return identity

    async def create(
        self,
        *,
        email: str | None = None,
        phone: str | None = None,
        password_hash: str | None,
        full_name: str,
        role: str = ROLE_CUSTOMER,
        email_verified_at: datetime | None = None,
        phone_verified_at: datetime | None = None,
    ) -> User:
        user = User(
            email=email,
            phone=phone,
            password_hash=password_hash,
            full_name=full_name,
            role=role,
            email_verified_at=email_verified_at,
            phone_verified_at=phone_verified_at,
        )
        self._session.add(user)
        await self._session.flush()
        return user


class RefreshTokenRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(
        self,
        *,
        user_id: int,
        family_id: uuid.UUID,
        token_hash: str,
        expires_at: datetime,
        user_agent: str | None = None,
        ip: str | None = None,
    ) -> RefreshToken:
        """`last_used_at` нь `created_at`-тай адил database-ийн цаг: хоёр цаг зөрөхгүй."""
        token = RefreshToken(
            user_id=user_id,
            family_id=family_id,
            token_hash=token_hash,
            expires_at=expires_at,
            user_agent=user_agent,
            ip=ip,
            last_used_at=func.now(),
        )
        self._session.add(token)
        await self._session.flush()
        return token

    async def get_for_update(self, token_hash: str) -> RefreshToken | None:
        """Түгжинэ: нэг token-оор зэрэг хийсэн хоёр refresh-ийг нэг нэгээр нь шийднэ."""
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash).with_for_update()
        )
        return result.scalar_one_or_none()

    async def get_by_hash(self, token_hash: str) -> RefreshToken | None:
        result = await self._session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def active_sessions(
        self, user_id: int, now: datetime
    ) -> list[tuple[RefreshToken, datetime]]:
        """Нээлттэй нэвтрэлт бүрт нэг мөр: хамгийн сүүлийн token болон нэвтрэлт эхэлсэн цаг."""
        began = (
            select(RefreshToken.family_id, func.min(RefreshToken.created_at).label("began"))
            .where(RefreshToken.user_id == user_id)
            .group_by(RefreshToken.family_id)
            .subquery()
        )
        result = await self._session.execute(
            select(RefreshToken, began.c.began)
            .join(began, began.c.family_id == RefreshToken.family_id)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.used_at.is_(None),
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            )
            .order_by(RefreshToken.id.desc())
        )
        return [(row[0], row[1]) for row in result.all()]

    async def revoke_family_of_user(
        self, user_id: int, family_id: uuid.UUID, now: datetime
    ) -> bool:
        """Нэг нэвтрэлтийг дуусгана (зөвхөн өөрийнх бол). False: нээлттэй нэвтрэлт олдсонгүй."""
        result = await self._session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.family_id == family_id,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
        return bool(result.rowcount)  # type: ignore[attr-defined]

    async def revoke_others(self, user_id: int, keep: uuid.UUID, now: datetime) -> None:
        await self._session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.family_id != keep,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )

    async def revoke_all_for_user(self, user_id: int, now: datetime) -> None:
        """Хэрэглэгчийн бүх нэвтрэлтийг дуусгана: нууц үг солигдоход хэрэглэнэ."""
        await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )

    async def delete_all_for_user(self, user_id: int) -> None:
        await self._session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))

    async def revoke_family(self, family_id: uuid.UUID, now: datetime) -> None:
        await self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )


class AddressRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_user(self, user_id: int) -> list[Address]:
        result = await self._session.execute(
            select(Address)
            .where(Address.user_id == user_id)
            .order_by(Address.is_default.desc(), Address.id)
        )
        return list(result.scalars())

    async def get(self, user_id: int, address_id: int) -> Address | None:
        """Эзэмшигчээр хязгаарлана: өөр хүний id нь байхгүй id-аас ялгагдахгүй."""
        result = await self._session.execute(
            select(Address).where(Address.id == address_id, Address.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def count(self, user_id: int) -> int:
        return len(await self.list_for_user(user_id))

    async def clear_default(self, user_id: int) -> None:
        await self._session.execute(
            update(Address)
            .where(Address.user_id == user_id, Address.is_default.is_(True))
            .values(is_default=False)
        )
        await self._session.flush()

    async def add(self, address: Address) -> Address:
        self._session.add(address)
        await self._session.flush()
        return address

    async def delete(self, address: Address) -> None:
        await self._session.delete(address)
        await self._session.flush()
