import asyncio
from datetime import UTC, datetime
from http import HTTPStatus

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import (
    FORBIDDEN_TYPE,
    INVALID_CREDENTIALS_TYPE,
    UNAUTHENTICATED_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.core.security import hash_password, verify_password
from angel.models import Address, Cart, OAuthIdentity, User, WishlistItem
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.schemas.accounts.auth import ChangePasswordRequest, DeleteAccountRequest
from angel.services.accounts.auth import AuthService, IssuedSession, UserView

log = get_logger(__name__)

DELETED_NAME = "Deleted user"


def _wrong_password() -> ProblemError:
    # 403, not 401: the person is signed in, and the web app treats a 401 as an expired session.
    return ProblemError(
        HTTPStatus.FORBIDDEN,
        "Incorrect password",
        "The password you entered is not right.",
        type_=INVALID_CREDENTIALS_TYPE,
    )


class AccountService:
    """What a signed-in person can do to their own account: rename it, set or change the password,
    delete it."""

    def __init__(self, session: AsyncSession, auth: AuthService) -> None:
        self._session = session
        self._auth = auth
        self._users = UserRepository(session)
        self._tokens = RefreshTokenRepository(session)

    async def update_name(self, user_id: int, full_name: str) -> UserView:
        async with self._session.begin():
            user = await self._active_user(user_id)
            user.full_name = full_name
            self._session.add(user)
            return UserView(user, await self._users.providers(user.id))

    async def change_password(self, user_id: int, request: ChangePasswordRequest) -> IssuedSession:
        """Sets or changes the password. Every other login ends (a changed password usually means
        the old one may be known to someone else) and this browser gets a fresh session."""
        async with self._session.begin():
            user = await self._active_user(user_id)
        await self._check_password(user, request.current_password)
        new_hash = await asyncio.to_thread(hash_password, request.new_password)
        async with self._session.begin():
            user = await self._active_user(user_id)
            user.password_hash = new_hash
            self._session.add(user)
            await self._tokens.revoke_all_for_user(user.id, datetime.now(UTC))
            issued = await self._auth.issue_session(user)
        await self._auth.clear_failures(user.email)
        log.info("password_changed", user_id=user_id, had_password=user.password_hash is not None)
        return issued

    async def delete(self, user_id: int, request: DeleteAccountRequest) -> None:
        """Anonymizes the account. Orders stay (accounting, and `orders.user_id` is RESTRICT), but
        keep only their own snapshots: the user row no longer says who it was."""
        async with self._session.begin():
            user = await self._active_user(user_id)
        if user.is_admin:
            raise ProblemError(
                HTTPStatus.FORBIDDEN,
                "Administrator accounts cannot be deleted here",
                type_=FORBIDDEN_TYPE,
            )
        if request.confirm_email != user.email:
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Confirmation does not match",
                "Type the email address of this account to delete it.",
            )
        await self._check_password(user, request.password)
        async with self._session.begin():
            user = await self._active_user(user_id)
            for model in (Address, WishlistItem, Cart, OAuthIdentity):
                await self._session.execute(delete(model).where(model.user_id == user.id))
            await self._tokens.delete_all_for_user(user.id)
            user.email = f"deleted-{user.id}@deleted.invalid"
            user.full_name = DELETED_NAME
            user.password_hash = None
            user.avatar_url = None
            user.is_active = False
            self._session.add(user)
        await self._auth.clear_failures(request.confirm_email)
        log.info("account_deleted", user_id=user_id)

    # --- helpers --------------------------------------------------------------------------

    async def _active_user(self, user_id: int) -> User:
        user = await self._users.get(user_id)
        if user is None or not user.is_active:
            raise ProblemError(
                HTTPStatus.UNAUTHORIZED,
                "Not signed in",
                "Please sign in again.",
                type_=UNAUTHENTICATED_TYPE,
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    async def _check_password(self, user: User, given: str | None) -> None:
        """Accounts with a password must prove it; Google-only accounts have nothing to prove."""
        if user.password_hash is None:
            return
        rate = await self._auth.check_failure_limit(user.email)
        if given is None or not await asyncio.to_thread(verify_password, given, user.password_hash):
            await self._auth.record_failure(user.email, rate)
            raise _wrong_password()
