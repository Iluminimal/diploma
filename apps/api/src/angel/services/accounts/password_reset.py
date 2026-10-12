"""Forgot password: a code goes to the phone number or email on the account, and with it the
person chooses a new password."""

import asyncio
from datetime import UTC, datetime
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import OTP_INVALID_TYPE, ProblemError
from angel.core.logging import get_logger
from angel.core.security import hash_password
from angel.models import User
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.services.accounts.auth import AuthService, IssuedSession
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
        """Always looks the same from outside: a code is sent only if the account exists, but the
        answer (and the cooldown) do not depend on it."""
        destination = normalize_destination(raw_destination, self._settings.default_phone_region)
        async with self._session.begin():
            user = await self._find(destination)
            user_id = user.id if user is not None and user.is_active else None
        await self._otp.issue(
            "reset_password", destination, user_id=user_id, deliver=user_id is not None
        )

    async def reset(self, raw_destination: str, code: str, new_password: str) -> IssuedSession:
        destination = normalize_destination(raw_destination, self._settings.default_phone_region)
        owner = await self._otp.verify("reset_password", destination, code)
        new_hash = await asyncio.to_thread(hash_password, new_password)
        now = datetime.now(UTC)
        async with self._session.begin():
            user = await self._users.get(owner) if owner is not None else None
            if user is None or not user.is_active:
                raise ProblemError(
                    HTTPStatus.BAD_REQUEST,
                    "That code is not right",
                    "Check the code and try again, or ask for a new one.",
                    type_=OTP_INVALID_TYPE,
                )
            user.password_hash = new_hash
            # The code reached the owner: that address or number is now proven.
            if is_phone(destination):
                user.phone_verified_at = user.phone_verified_at or now
            else:
                user.email_verified_at = user.email_verified_at or now
            self._session.add(user)
            # A forgotten password may be a leaked one: every login ends.
            await RefreshTokenRepository(self._session).revoke_all_for_user(user.id, now)
            issued = await self._auth.issue_session(user)
        await self._auth.clear_failures(user.identifier)
        log.info("password_reset", user_id=user.id)
        return issued

    async def _find(self, destination: str) -> User | None:
        if is_phone(destination):
            return await self._users.get_by_phone(destination)
        return await self._users.get_by_email(destination)
