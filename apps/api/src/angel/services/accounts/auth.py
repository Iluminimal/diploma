import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from http import HTTPStatus

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    EMAIL_TAKEN_TYPE,
    INVALID_CREDENTIALS_TYPE,
    UNAUTHENTICATED_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.core.rate_limit import RATE_LIMITED_TYPE, Rate, RateLimiter
from angel.core.security import (
    AccessToken,
    burn_password_check,
    create_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_opaque_token,
    verify_password,
)
from angel.models import User
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.repositories.catalog.products import ProductRepository
from angel.repositories.commerce.carts import CartRepository
from angel.schemas.accounts.auth import LoginRequest, RegisterRequest, UserOut
from angel.services.commerce.cart import merge_guest_cart

log = get_logger(__name__)

# Two tabs refreshing at the same moment present the same refresh token: the loser must not be
# mistaken for a thief. Beyond this window a reused token means it leaked.
REUSE_GRACE = timedelta(seconds=10)
_LOGIN_FAILURES = "login-fail"


@dataclass(frozen=True)
class UserView:
    """A user with the sign-in providers linked to them: what the API shows of an account."""

    user: User
    providers: list[str]

    def out(self) -> UserOut:
        user = self.user
        return UserOut(
            id=user.id,
            email=user.email,
            phone=user.phone,
            email_verified=user.email_verified_at is not None,
            phone_verified=user.phone_verified_at is not None,
            full_name=user.full_name,
            role="admin" if user.is_admin else "customer",
            avatar_url=user.avatar_url,
            has_password=user.password_hash is not None,
            providers=self.providers,
        )


@dataclass(frozen=True)
class IssuedSession:
    access: AccessToken
    refresh_token: str
    refresh_max_age: int
    user: UserView
    is_new_user: bool = False


def _invalid_credentials() -> ProblemError:
    return ProblemError(
        HTTPStatus.UNAUTHORIZED,
        "Invalid email or password",
        type_=INVALID_CREDENTIALS_TYPE,
    )


def _unauthenticated(detail: str = "Please sign in again.") -> ProblemError:
    return ProblemError(
        HTTPStatus.UNAUTHORIZED,
        "Not signed in",
        detail,
        type_=UNAUTHENTICATED_TYPE,
        headers={"WWW-Authenticate": "Bearer"},
    )


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        jwt_secret: str,
        limiter: RateLimiter,
        mailer: Mailer,
    ) -> None:
        self._session = session
        self._settings = settings
        self._secret = jwt_secret
        self._limiter = limiter
        self._mailer = mailer
        self._users = UserRepository(session)
        self._tokens = RefreshTokenRepository(session)

    async def register(
        self, request: RegisterRequest, guest_cart_token: str | None
    ) -> IssuedSession:
        # Hashing is CPU-bound (~50 ms): keep it off the event loop.
        password_hash = await asyncio.to_thread(hash_password, request.password)
        async with self._session.begin():
            if await self._users.get_by_email(request.email) is not None:
                raise self._email_taken()
            try:
                user = await self._users.create(
                    email=request.email, password_hash=password_hash, full_name=request.full_name
                )
            except IntegrityError:  # lost a race with a concurrent registration
                raise self._email_taken() from None
            await self._merge_cart(user.id, guest_cart_token)
            issued = await self._issue(user, family_id=uuid.uuid4())
        await self._mailer.send(
            Email(
                to=request.email,
                subject="Welcome to Angel",
                body=f"Hi {user.full_name}, your account is ready.",
            )
        )
        return issued

    async def login(self, request: LoginRequest, guest_cart_token: str | None) -> IssuedSession:
        # Failed attempts per email, on top of the per-address limit on the route: this is what
        # slows a distributed guessing attack on one account.
        failure_rate = await self.check_failure_limit(request.email)
        async with self._session.begin():
            user = await self._users.get_by_email(request.email)
        # Always verify something, so an unknown email costs the same as a wrong password.
        # No password hash: an account that only signs in with Google. It looks like any other
        # failed login, so the form never reveals which emails exist or how they sign in.
        if user is None or not user.is_active or user.password_hash is None:
            await asyncio.to_thread(burn_password_check, request.password)
            await self._count_failure(request.email, failure_rate)
            raise _invalid_credentials()
        if not await asyncio.to_thread(verify_password, request.password, user.password_hash):
            await self._count_failure(request.email, failure_rate)
            raise _invalid_credentials()
        await self._limiter.reset(_LOGIN_FAILURES, hash_token(request.email))
        new_hash = (
            await asyncio.to_thread(hash_password, request.password)
            if needs_rehash(user.password_hash)
            else None
        )
        async with self._session.begin():
            if new_hash is not None:
                user.password_hash = new_hash
                self._session.add(user)
            return await self.start_session(user, guest_cart_token)

    async def refresh(self, refresh_token: str | None) -> IssuedSession:
        if not refresh_token:
            raise _unauthenticated()
        now = datetime.now(UTC)
        failure: str | None = None
        issued: IssuedSession | None = None
        async with self._session.begin():
            row = await self._tokens.get_for_update(hash_token(refresh_token))
            if row is None:
                failure = "unknown"
            elif row.revoked_at is not None or row.expires_at <= now:
                failure = "revoked_or_expired"
            elif row.used_at is not None:
                failure = "reused"
                if now - row.used_at > REUSE_GRACE:
                    # Someone is replaying a token that was already rotated: assume it was
                    # stolen and end every session that descends from the same login.
                    await self._tokens.revoke_family(row.family_id, now)
                    log.warning("refresh_token_reuse", user_id=row.user_id)
                    failure = "reuse_detected"
            else:
                user = await self._users.get(row.user_id)
                if user is None or not user.is_active:
                    failure = "inactive"
                else:
                    row.used_at = now
                    issued = await self._issue(user, family_id=row.family_id)
        # Raised after the block so that the family revocation above is committed.
        if issued is None:
            log.info("refresh_rejected", reason=failure)
            raise _unauthenticated()
        return issued

    async def logout(self, refresh_token: str | None) -> None:
        """Ends the session the cookie belongs to. Always succeeds: logging out twice is fine."""
        if not refresh_token:
            return
        async with self._session.begin():
            row = await self._tokens.get_for_update(hash_token(refresh_token))
            if row is not None:
                await self._tokens.revoke_family(row.family_id, datetime.now(UTC))

    async def me(self, user_id: int) -> UserView:
        async with self._session.begin():
            user = await self._users.get(user_id)
            if user is None or not user.is_active:
                raise _unauthenticated()
            return UserView(user, await self._users.providers(user.id))

    # --- failed-attempt limit (shared with the account endpoints that check a password) ----

    async def check_failure_limit(self, email: str) -> Rate:
        """Raises 429 when this email has had too many wrong passwords lately."""
        rate = Rate.parse(self._settings.rate_limit_login_email)
        if self._settings.rate_limit_enabled:
            decision = await self._limiter.peek(_LOGIN_FAILURES, hash_token(email), rate)
            if not decision.allowed:
                raise ProblemError(
                    HTTPStatus.TOO_MANY_REQUESTS,
                    "Too many failed attempts",
                    f"Try again in {decision.reset_seconds} s.",
                    type_=RATE_LIMITED_TYPE,
                    headers={"Retry-After": str(decision.reset_seconds)},
                )
        return rate

    async def record_failure(self, email: str, rate: Rate) -> None:
        await self._count_failure(email, rate)

    async def clear_failures(self, email: str) -> None:
        await self._limiter.reset(_LOGIN_FAILURES, hash_token(email))

    async def issue_session(self, user: User) -> IssuedSession:
        """A new login (new refresh family) without touching the cart. Runs in the caller's
        transaction."""
        return await self._issue(user, family_id=uuid.uuid4())

    async def start_session(self, user: User, guest_cart_token: str | None) -> IssuedSession:
        """A new login: the guest cart joins the account's and a new refresh family begins.
        Runs inside the caller's transaction (password login and sign-in with Google)."""
        await self._merge_cart(user.id, guest_cart_token)
        return await self._issue(user, family_id=uuid.uuid4())

    # --- helpers --------------------------------------------------------------------------

    async def _issue(self, user: User, *, family_id: uuid.UUID) -> IssuedSession:
        refresh_token = new_opaque_token()
        max_age = int(timedelta(days=self._settings.refresh_token_ttl_days).total_seconds())
        await self._tokens.add(
            user_id=user.id,
            family_id=family_id,
            token_hash=hash_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(seconds=max_age),
        )
        access = create_access_token(user.id, self._secret, self._settings.access_token_ttl_seconds)
        view = UserView(user, await self._users.providers(user.id))
        return IssuedSession(access, refresh_token, max_age, view)

    async def _merge_cart(self, user_id: int, guest_cart_token: str | None) -> None:
        await merge_guest_cart(
            CartRepository(self._session),
            ProductRepository(self._session),
            user_id=user_id,
            guest_token=guest_cart_token,
            max_per_line=self._settings.cart_max_quantity,
        )

    async def _count_failure(self, email: str, rate: Rate) -> None:
        if self._settings.rate_limit_enabled:
            await self._limiter.hit(_LOGIN_FAILURES, hash_token(email), rate)

    @staticmethod
    def _email_taken() -> ProblemError:
        return ProblemError(
            HTTPStatus.CONFLICT,
            "Email already registered",
            "An account with this email already exists. Try signing in.",
            type_=EMAIL_TAKEN_TYPE,
        )
