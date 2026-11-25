import asyncio
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from typing import cast

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    EMAIL_TAKEN_TYPE,
    INVALID_CREDENTIALS_TYPE,
    UNAUTHENTICATED_TYPE,
    WEAK_PASSWORD_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.core.passwords import WeakReason, weakness
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
from angel.models import security as events
from angel.repositories.accounts.security_events import SecurityEventRepository
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.repositories.catalog.products import ProductRepository
from angel.repositories.commerce.carts import CartRepository
from angel.schemas.accounts.auth import LoginRequest, RegisterRequest, Role, UserOut
from angel.services.accounts.devices import describe_device
from angel.services.commerce.cart import merge_guest_cart

log = get_logger(__name__)

# Хоёр tab зэрэг refresh хийхэд ижил refresh token ирнэ: хожигдогчийг хулгайч гэж андуурч болохгүй.
# Энэ цонхноос хойш token дахин ирвэл алдагдсан гэсэн үг.
REUSE_GRACE = timedelta(seconds=10)
_LOGIN_FAILURES = "login-fail"
# Өдрийн хязгаар: удаан, өргөн тархсан таамаглалыг 5 минутын цонх барьж чаддаггүй.
_LOGIN_FAILURES_DAILY = "login-fail-day"


@dataclass(frozen=True)
class ClientInfo:
    """ "Миний төхөөрөмжүүд" жагсаалтад харагдах нэвтрэлтийн мэдээлэл, нэвтрэлтийг үүсгэсэн
    хүсэлтээс авсан."""

    user_agent: str | None = None
    ip: str | None = None


@dataclass(frozen=True)
class UserView:
    """Холбогдсон нэвтрэх provider-уудтай хэрэглэгч: бүртгэлээс API юу харуулдаг."""

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
            role=cast(Role, user.role),
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
        "Имэйл эсвэл нууц үг буруу байна",
        type_=INVALID_CREDENTIALS_TYPE,
    )


_WEAK_DETAIL: dict[WeakReason, str] = {
    "common": "Энэ нууц үг хэт түгээмэл тул таамаглахад амархан. Өөр, урт нууц үг сонгоно уу.",
    "repeated": "Нууц үг хэт давтагдсан тэмдэгтүүдээс бүрдэж байна. Өөр нууц үг сонгоно уу.",
    "contains_identity": "Нууц үг таны имэйл эсвэл нэрийг агуулж байна. Өөр нууц үг сонгоно уу.",
}


def ensure_strong_password(
    password: str, *, email: str | None = None, full_name: str | None = None
) -> None:
    """Сул нууц үгийг 422-оор татгалзана (шалтгаан нь `reason` өргөтгөлд)."""
    reason = weakness(password, email=email, full_name=full_name)
    if reason is not None:
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Нууц үг хэт сул байна",
            _WEAK_DETAIL[reason],
            type_=WEAK_PASSWORD_TYPE,
            extensions={"reason": reason},
        )


def _unauthenticated(detail: str = "Дахин нэвтэрнэ үү.") -> ProblemError:
    return ProblemError(
        HTTPStatus.UNAUTHORIZED,
        "Нэвтрээгүй байна",
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
        client: ClientInfo | None = None,
    ) -> None:
        self._client = client or ClientInfo()
        self._session = session
        self._settings = settings
        self._secret = jwt_secret
        self._limiter = limiter
        self._mailer = mailer
        self._users = UserRepository(session)
        self._tokens = RefreshTokenRepository(session)
        self._events = SecurityEventRepository(session)
        # Transaction commit хийгдсэний дараа илгээх мэдэгдлүүд (`deliver_notices`).
        self._notices: list[Email] = []

    # --- аюулгүй байдлын үйл явдал, мэдэгдэл ---

    def record_event(self, user_id: int, type_: str, *, method: str | None = None) -> None:
        """Энэ хүсэлтийн төхөөрөмж, IP-тэй үйл явдлыг дуудагчийн transaction-д нэмнэ."""
        self._events.add(
            user_id,
            type_,
            method=method,
            ip=self._client.ip,
            user_agent=self._client.user_agent,
        )

    def queue_notice(self, email: Email) -> None:
        """Мэдэгдлийг дараа илгээхээр хадгална: transaction буцвал хэн ч мэдэгдэл авахгүй."""
        self._notices.append(email)

    async def deliver_notices(self) -> None:
        """Commit хийсний дараа дуудна. Мэдэгдэл илгээж чадаагүй нь нэвтрэлт, солилтыг унагахгүй."""
        notices, self._notices = self._notices, []
        for notice in notices:
            try:
                await self._mailer.send(notice)
            except Exception as exc:
                log.warning("security_notice_failed", error=type(exc).__name__)

    async def register(
        self, request: RegisterRequest, guest_cart_token: str | None
    ) -> IssuedSession:
        ensure_strong_password(request.password, email=request.email, full_name=request.full_name)
        # Hash хийх нь CPU-ийн ажил (~50 ms): event loop-оос холдуул.
        password_hash = await asyncio.to_thread(hash_password, request.password)
        async with self._session.begin():
            if await self._users.get_by_email(request.email) is not None:
                raise self._email_taken()
            try:
                user = await self._users.create(
                    email=request.email, password_hash=password_hash, full_name=request.full_name
                )
            except IntegrityError:  # зэрэг хийсэн өөр бүртгэлд хожигдсон
                raise self._email_taken() from None
            await self._merge_cart(user.id, guest_cart_token)
            issued = await self._issue(user, family_id=uuid.uuid4())
        await self._mailer.send(
            Email(
                to=request.email,
                subject="Angel-д тавтай морил",
                body=f"Сайн байна уу, {user.full_name}! Таны бүртгэл бэлэн боллоо.",
            )
        )
        return issued

    async def login(self, request: LoginRequest, guest_cart_token: str | None) -> IssuedSession:
        # Email тус бүрийн амжилтгүй оролдлого, route дээрх хаяг тус бүрийн хязгаараас гадна: нэг
        # бүртгэлийг тархсан байдлаар таамаглах халдлагыг энэ удаашруулна.
        failure_rate = await self.check_failure_limit(request.email)
        async with self._session.begin():
            user = await self._users.get_by_email(request.email)
        # Үргэлж ямар нэг зүйл шалга: ингэвэл мэдэгдээгүй email буруу нууц үгтэй ижил хугацаа авна.
        # Нууц үгийн hash байхгүй бол зөвхөн Google-ээр нэвтэрдэг бүртгэл. Энэ нь бусад амжилтгүй
        # нэвтрэлттэй ижил харагдана, тиймээс форм аль email байгааг, хэрхэн нэвтэрдгийг хэзээ ч
        # илчлэхгүй.
        if user is None or not user.is_active or user.password_hash is None:
            await asyncio.to_thread(burn_password_check, request.password)
            await self._count_failure(request.email, failure_rate)
            raise _invalid_credentials()
        if not await asyncio.to_thread(verify_password, request.password, user.password_hash):
            await self._count_failure(request.email, failure_rate, user)
            async with self._session.begin():
                self.record_event(user.id, events.LOGIN_FAILED, method="password")
            log.info("login_failed", email_hash=hash_token(request.email)[:12])
            await self.deliver_notices()
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
            issued = await self.start_session(user, guest_cart_token)
        await self.deliver_notices()
        return issued

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
                    # Аль хэдийн rotate хийгдсэн token-ийг дахин ашиглаж байна: хулгайлагдсан гэж
                    # үзээд ижил нэвтрэлтээс үүссэн бүх session-ийг дуусга.
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
        # Блокийн дараа шиднэ, ингэвэл дээрх family-г хүчингүй болгосон өөрчлөлт commit хийгдсэн
        # байна.
        if issued is None:
            log.info("refresh_rejected", reason=failure)
            raise _unauthenticated()
        return issued

    async def logout(self, refresh_token: str | None) -> None:
        """Cookie-ийн session-ийг дуусгана. Үргэлж амжилттай: хоёр удаа гарсан ч зүгээр."""
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

    # --- амжилтгүй оролдлогын хязгаар (нууц үг шалгадаг бүртгэлийн endpoint-уудтай хуваалцана) ---

    async def check_failure_limit(self, email: str) -> Rate:
        """Энэ email сүүлийн үед хэт олон буруу нууц үгтэй байвал 429 шиднэ."""
        rate = Rate.parse(self._settings.rate_limit_login_email)
        daily = Rate.parse(self._settings.rate_limit_login_email_daily)
        if self._settings.rate_limit_enabled:
            for name, limit in ((_LOGIN_FAILURES_DAILY, daily), (_LOGIN_FAILURES, rate)):
                decision = await self._limiter.peek(name, hash_token(email), limit)
                if decision.allowed:
                    continue
                raise ProblemError(
                    HTTPStatus.TOO_MANY_REQUESTS,
                    "Олон удаа буруу оролдлоо",
                    f"{decision.reset_seconds} секундийн дараа дахин оролдоно уу.",
                    type_=RATE_LIMITED_TYPE,
                    headers={"Retry-After": str(decision.reset_seconds)},
                )
        return rate

    async def record_failure(self, email: str, rate: Rate) -> None:
        await self._count_failure(email, rate)

    async def clear_failures(self, email: str, *, include_daily: bool = False) -> None:
        """Амжилттай нэвтрэхэд богино цонхыг цэвэрлэнэ. Өдрийн тоолуур үлдэнэ (амжилт нь удаан
        таамаглагчийн тоог тэглэж болохгүй); нууц үг солих, сэргээх үед л тэглэнэ."""
        await self._limiter.reset(_LOGIN_FAILURES, hash_token(email))
        if include_daily:
            await self._limiter.reset(_LOGIN_FAILURES_DAILY, hash_token(email))

    async def issue_session(self, user: User) -> IssuedSession:
        """Cart-д хүрэлгүй шинэ нэвтрэлт (шинэ refresh family). Дуудагчийн transaction дотор
        ажиллана."""
        return await self._issue(user, family_id=uuid.uuid4())

    async def start_session(
        self, user: User, guest_cart_token: str | None, *, method: str = "password"
    ) -> IssuedSession:
        """Шинэ нэвтрэлт: зочны cart бүртгэлийнхтэй нэгдэж, шинэ refresh family эхэлнэ. Нэвтрэлтийг
        аюулгүй байдлын журналд бичиж, энэ төхөөрөмж урьд нь бүртгэлд нэвтэрч байгаагүй бол
        эзэнд мэдэгдэнэ. Дуудагчийн transaction дотор ажиллана (нууц үг, код, Google); мэдэгдэл
        commit-ийн дараа `deliver_notices`-оор явна."""
        await self._merge_cart(user.id, guest_cart_token)
        # Шинэ token нэмэхээс өмнө: тэгэхгүй бол энэ нэвтрэлт өөрөө "урьд нь байсан" болно.
        any_before, seen = await self._events.device_history(user.id, self._client.user_agent)
        issued = await self._issue(user, family_id=uuid.uuid4())
        self.record_event(user.id, events.LOGIN, method=method)
        if any_before and not seen:
            self.record_event(user.id, events.NEW_DEVICE, method=method)
            self._notify_new_device(user)
        return issued

    # --- туслах функцууд ---

    async def _issue(self, user: User, *, family_id: uuid.UUID) -> IssuedSession:
        refresh_token = new_opaque_token()
        max_age = int(timedelta(days=self._settings.refresh_token_ttl_days).total_seconds())
        if user.is_staff:
            # Ажилтны бүртгэл илүү их эрхтэй: ашиглаагүй бол ердийн хэрэглэгчээс эрт дуусна.
            max_age = min(max_age, self._settings.staff_refresh_ttl_hours * 3600)
        now = datetime.now(UTC)
        await self._tokens.add(
            user_id=user.id,
            family_id=family_id,
            token_hash=hash_token(refresh_token),
            expires_at=now + timedelta(seconds=max_age),
            user_agent=self._client.user_agent,
            ip=self._client.ip,
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

    async def _count_failure(self, email: str, rate: Rate, user: User | None = None) -> None:
        if not self._settings.rate_limit_enabled:
            return
        await self._limiter.hit(_LOGIN_FAILURES, hash_token(email), rate)
        daily = await self._limiter.hit(
            _LOGIN_FAILURES_DAILY,
            hash_token(email),
            Rate.parse(self._settings.rate_limit_login_email_daily),
        )
        # Хязгаарт яг хүрсэн нэг удаа: эзэнд мэдэгдэнэ (өдөр бүр нэгээс олонгүй).
        if user is not None and user.email and daily.allowed and daily.remaining == 0:
            self.queue_notice(
                Email(
                    to=user.email,
                    subject="Таны бүртгэлд олон удаа буруу нууц үг оруулжээ",
                    body="Таны бүртгэлд нэвтрэхийг олон удаа буруу нууц үгээр оролдсон тул "
                    "нэвтрэлтийг түр түгжлээ. Хэрэв энэ та биш бол нууц үгээ солино уу.",
                )
            )

    def _notify_new_device(self, user: User) -> None:
        if not user.email:
            return  # зөвхөн утасны бүртгэл: үйл явдал журналд харагдана
        when = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
        self.queue_notice(
            Email(
                to=user.email,
                subject="Шинэ төхөөрөмжөөс нэвтэрлээ",
                body="Таны бүртгэлд шинэ төхөөрөмжөөс нэвтэрлээ.\n\n"
                f"Төхөөрөмж: {describe_device(self._client.user_agent)}\n"
                f"Цаг: {when}\n\n"
                "Хэрэв энэ та биш бол нууц үгээ даруй солиод, профайлынхаа төхөөрөмжүүдээс "
                "бусад нэвтрэлтийг дуусгана уу.",
            )
        )

    @staticmethod
    def _email_taken() -> ProblemError:
        return ProblemError(
            HTTPStatus.CONFLICT,
            "Имэйл бүртгэлтэй байна",
            "Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна. Нэвтэрч үзнэ үү.",
            type_=EMAIL_TAKEN_TYPE,
        )
