"""Нууц үг мартсан: бүртгэлийн утасны дугаар эсвэл email руу код очиж, түүгээр шинэ нууц үг
сонгоно."""

import asyncio
from datetime import UTC, datetime
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import OTP_INVALID_TYPE, ProblemError
from angel.core.logging import get_logger
from angel.core.mail import Email
from angel.core.security import hash_password
from angel.models import User
from angel.models import security as events
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.services.accounts.auth import AuthService, IssuedSession, ensure_strong_password
from angel.services.accounts.otp import OtpService, is_phone, normalize_destination

log = get_logger(__name__)


class PasswordResetService:
    def __init__(
        self, session: AsyncSession, settings: Settings, otp: OtpService, auth: AuthService
    ) -> None:
        self._session = session
        self._settings = settings
        self._otp = otp
        self._auth = auth
        self._users = UserRepository(session)

    async def forgot(self, raw_destination: str) -> None:
        """Гаднаас үргэлж ижил харагдана: бүртгэл байвал л код илгээгдэнэ, гэхдээ хариу (болон
        cooldown) үүнээс хамаарахгүй."""
        destination = normalize_destination(raw_destination, self._settings.default_phone_region)
        async with self._session.begin():
            user = await self._find(destination)
            user_id = user.id if user is not None and user.is_active else None
        await self._otp.issue(
            "reset_password", destination, user_id=user_id, deliver=user_id is not None
        )

    async def reset(self, raw_destination: str, code: str, new_password: str) -> IssuedSession:
        destination = normalize_destination(raw_destination, self._settings.default_phone_region)
        # Кодыг шалгахаас ӨМНӨ: сул нууц үгэнд код үрэгдэхгүй (нэр, имэйлтэй харьцуулалт хийхгүй:
        # бүртгэлийг код шалгасны дараа л мэднэ).
        ensure_strong_password(new_password)
        owner = await self._otp.verify("reset_password", destination, code)
        new_hash = await asyncio.to_thread(hash_password, new_password)
        now = datetime.now(UTC)
        async with self._session.begin():
            user = await self._users.get(owner) if owner is not None else None
            if user is None or not user.is_active:
                raise ProblemError(
                    HTTPStatus.BAD_REQUEST,
                    "Код буруу байна",
                    "Кодоо шалгаад дахин оролдоно уу, эсвэл шинэ код авна уу.",
                    type_=OTP_INVALID_TYPE,
                )
            user.password_hash = new_hash
            # Код эзэнд хүрсэн: тэр хаяг эсвэл дугаар одоо баталгаажлаа.
            if is_phone(destination):
                user.phone_verified_at = user.phone_verified_at or now
            else:
                user.email_verified_at = user.email_verified_at or now
            self._session.add(user)
            # Мартсан нууц үг алдагдсан байж болно: бүх нэвтрэлт дуусна.
            await RefreshTokenRepository(self._session).revoke_all_for_user(user.id, now)
            issued = await self._auth.issue_session(user)
            self._auth.record_event(user.id, events.PASSWORD_RESET)
            if user.email:
                self._auth.queue_notice(
                    Email(
                        to=user.email,
                        subject="Таны нууц үг сэргээгдлээ",
                        body="Таны бүртгэлийн нууц үг сэргээгдэж, бүх нэвтрэлт дууслаа. "
                        "Хэрэв энэ та биш бол бидэнтэй яаралтай холбогдоно уу.",
                    )
                )
        await self._auth.deliver_notices()
        await self._auth.clear_failures(user.identifier, include_daily=True)
        log.info("password_reset", user_id=user.id)
        return issued

    async def _find(self, destination: str) -> User | None:
        if is_phone(destination):
            return await self._users.get_by_phone(destination)
        return await self._users.get_by_email(destination)
