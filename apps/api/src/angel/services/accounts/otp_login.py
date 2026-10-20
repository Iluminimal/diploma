"""Утасны дугаар эсвэл email руу илгээсэн нэг удаагийн кодоор нэвтрэх (эсвэл бүртгүүлэх)."""

from dataclasses import replace
from datetime import UTC, datetime
from http import HTTPStatus

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import FORBIDDEN_TYPE, ProblemError
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.models import User
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.services.accounts.auth import AuthService, IssuedSession
from angel.services.accounts.otp import OtpService, is_phone, normalize_destination

log = get_logger(__name__)

# Утасны шинэ бүртгэлд хуудас асуух хүртэл нэр байхгүй.
NEW_CUSTOMER_NAME = "New customer"


class OtpLoginService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        otp: OtpService,
        auth: AuthService,
        mailer: Mailer,
    ) -> None:
        self._session = session
        self._settings = settings
        self._otp = otp
        self._auth = auth
        self._mailer = mailer
        self._users = UserRepository(session)

    async def request_code(self, raw_destination: str) -> None:
        """Хүчинтэй хаягийн хувьд бүртгэл байгаа эсэхээс үл хамааран үргэлж амжилттай: нэвтрэх,
        бүртгүүлэх нь ижил алхам тул нуух зүйл байхгүй."""
        destination = normalize_destination(raw_destination, self._settings.default_phone_region)
        await self._otp.issue("login", destination)

    async def sign_in(
        self, raw_destination: str, code: str, guest_cart_token: str | None
    ) -> IssuedSession:
        destination = normalize_destination(raw_destination, self._settings.default_phone_region)
        await self._otp.verify("login", destination, code)
        # Код зарцуулагдсан. Хоёр дахь хүсэлт зэрэг ижил бүртгэл үүсгэвэл нэг insert хожигдоно: тэр
        # зүгээр л бүртгэлийг дахин хайна.
        for attempt in (1, 2):
            try:
                return await self._sign_in_verified(destination, guest_cart_token)
            except IntegrityError:
                if attempt == 2:
                    raise
        raise AssertionError("unreachable")  # pragma: no cover

    async def _sign_in_verified(
        self, destination: str, guest_cart_token: str | None
    ) -> IssuedSession:
        now = datetime.now(UTC)
        phone = is_phone(destination)
        created = False
        async with self._session.begin():
            user = await (
                self._users.get_by_phone(destination)
                if phone
                else self._users.get_by_email(destination)
            )
            if user is None:
                user = await self._users.create(
                    email=None if phone else destination,
                    phone=destination if phone else None,
                    password_hash=None,
                    full_name=NEW_CUSTOMER_NAME,
                    email_verified_at=None if phone else now,
                    phone_verified_at=now if phone else None,
                )
                created = True
            elif not user.is_active:
                raise ProblemError(
                    HTTPStatus.FORBIDDEN,
                    "This account is disabled",
                    "Contact us if you think this is a mistake.",
                    type_=FORBIDDEN_TYPE,
                )
            else:
                await self._stamp_verified(user, phone=phone, now=now)
            issued = await self._auth.start_session(user, guest_cart_token)
        if created and not phone:
            await self._mailer.send(
                Email(
                    to=destination,
                    subject="Welcome to Angel",
                    body="Your account is ready.",
                )
            )
        return replace(issued, is_new_user=created)

    async def _stamp_verified(self, user: User, *, phone: bool, now: datetime) -> None:
        if phone:
            user.phone_verified_at = user.phone_verified_at or now
        else:
            if user.email_verified_at is None:
                # Энэ хаягийг эзэмшдэгээ хэн ч нотлоогүй тул нууц үгээр түрүүлж бүртгүүлсэн хүн
                # булаан авагч байж болно. Код одоо эзэн энд байгааг нотолно: нууц үгийг устгаад
                # хуучин session-уудыг дуусга (Google-ээр нэвтрэхтэй ижил дүрэм).
                if user.password_hash is not None:
                    log.info("otp_password_removed", user_id=user.id)
                    user.password_hash = None
                    await RefreshTokenRepository(self._session).revoke_all_for_user(user.id, now)
                user.email_verified_at = now
        self._session.add(user)
