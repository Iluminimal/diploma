from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import quote

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.core.oauth_state import (
    FLOW_TTL_SECONDS,
    code_challenge,
    new_flow,
    read_flow,
    safe_next,
    sign_flow,
    states_match,
)
from angel.models import User
from angel.oauth import OAuthError, OAuthProvider
from angel.repositories.accounts.users import UserRepository
from angel.services.accounts.auth import AuthService, IssuedSession

log = get_logger(__name__)

MAX_NAME_LENGTH = 120


class OAuthFailure(Exception):
    """A sign-in that must end on the login page. `reason` is the `?error=` code shown there."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class SignInStart:
    url: str
    cookie_value: str
    cookie_max_age: int


@dataclass(frozen=True)
class SignInResult:
    session: IssuedSession
    next_path: str


class OAuthService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        jwt_secret: str,
        provider: OAuthProvider,
        auth: AuthService,
        mailer: Mailer,
    ) -> None:
        self._session = session
        self._settings = settings
        self._secret = jwt_secret
        self._provider = provider
        self._auth = auth
        self._mailer = mailer
        self._users = UserRepository(session)

    def begin(self, next_path: str | None, login_hint: str | None) -> SignInStart:
        flow = new_flow(safe_next(next_path))
        url = self._provider.authorization_url(
            state=flow.state,
            nonce=flow.nonce,
            code_challenge=code_challenge(flow.verifier),
            login_hint=login_hint,
        )
        return SignInStart(url, sign_flow(flow, self._secret), FLOW_TTL_SECONDS)

    async def complete(
        self, *, code: str, state: str, flow_cookie: str | None, guest_cart_token: str | None
    ) -> SignInResult:
        flow = read_flow(flow_cookie, self._secret)
        if flow is None or not states_match(flow.state, state):
            log.info("oauth_rejected", reason="state")
            raise OAuthFailure("google_failed")
        try:
            profile = await self._provider.exchange(
                code=code, code_verifier=flow.verifier, nonce=flow.nonce
            )
        except OAuthError as exc:
            log.info("oauth_rejected", reason=str(exc))
            raise OAuthFailure(exc.reason) from exc
        if not profile.email_verified:
            log.info("oauth_rejected", reason="email_unverified")
            raise OAuthFailure("google_unverified")

        email = profile.email.strip().lower()
        created = False
        try:
            async with self._session.begin():
                user = await self._users.get_by_identity(self._provider.name, profile.subject)
                if user is None:
                    user, created = await self._link_or_create(email, profile.subject, profile.name)
                if not user.is_active:
                    raise OAuthFailure("account_disabled")
                if profile.picture and user.avatar_url != profile.picture:
                    user.avatar_url = profile.picture
                    self._session.add(user)
                issued = await self._auth.start_session(user, guest_cart_token)
        except IntegrityError:
            # Lost a race with the same person signing in twice at once: they can simply retry.
            log.warning("oauth_race")
            raise OAuthFailure("google_failed") from None
        if created:
            await self._mailer.send(
                Email(
                    to=email,
                    subject="Welcome to Angel",
                    body=f"Hi {user.full_name}, your account is ready.",
                )
            )
        # An administrator who did not ask for a particular page lands in the admin area.
        next_path = "/admin" if user.is_admin and flow.next_path == "/" else flow.next_path
        return SignInResult(issued, next_path)

    async def _link_or_create(
        self, email: str, subject: str, name: str | None
    ) -> tuple[User, bool]:
        user = await self._users.get_by_email(email)
        if user is None:
            full_name = (name or email.split("@")[0]).strip()[:MAX_NAME_LENGTH]
            user = await self._users.create(
                email=email,
                password_hash=None,
                full_name=full_name,
                email_verified_at=datetime.now(UTC),
            )
            created = True
        else:
            # Google vouches for this email, and nobody has verified the address of an account
            # made with a password, so whoever registered it first might not be its owner. Drop
            # the password: the owner now signs in with Google, a squatter cannot.
            if user.password_hash is not None:
                log.info("oauth_password_removed", user_id=user.id)
                user.password_hash = None
            if user.email_verified_at is None:
                user.email_verified_at = datetime.now(UTC)
            self._session.add(user)
            created = False
        await self._users.add_identity(
            user_id=user.id, provider=self._provider.name, subject=subject, email=email
        )
        return user, created


def login_error_url(settings: Settings, reason: str) -> str:
    return f"{settings.web_base_url.rstrip('/')}/login?error={quote(reason)}"
