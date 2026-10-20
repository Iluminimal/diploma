import asyncio
import uuid
from datetime import UTC, datetime
from http import HTTPStatus

from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    EMAIL_TAKEN_TYPE,
    FORBIDDEN_TYPE,
    INVALID_CREDENTIALS_TYPE,
    LAST_SIGN_IN_METHOD_TYPE,
    PHONE_TAKEN_TYPE,
    UNAUTHENTICATED_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.core.security import hash_password, hash_token, verify_password
from angel.models import Address, Cart, OAuthIdentity, User, WishlistItem
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.schemas.accounts.auth import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    DeviceSession,
)
from angel.services.accounts.auth import AuthService, IssuedSession, UserView
from angel.services.accounts.devices import describe_device
from angel.services.accounts.otp import (
    OtpService,
    normalize_email,
    normalize_phone_number,
)

log = get_logger(__name__)

DELETED_NAME = "Deleted user"


def _wrong_password() -> ProblemError:
    # 403, 401 биш: хэрэглэгч нэвтэрсэн байгаа, мөн web app 401-ийг session дууссан гэж ойлгодог.
    return ProblemError(
        HTTPStatus.FORBIDDEN,
        "Incorrect password",
        "The password you entered is not right.",
        type_=INVALID_CREDENTIALS_TYPE,
    )


class AccountService:
    """Нэвтэрсэн хүн өөрийн бүртгэлд хийж болох зүйлс: нэр солих, нууц үг тохируулах эсвэл солих,
    устгах."""

    def __init__(
        self, session: AsyncSession, auth: AuthService, otp: OtpService, settings: Settings
    ) -> None:
        self._session = session
        self._auth = auth
        self._otp = otp
        self._settings = settings
        self._users = UserRepository(session)
        self._tokens = RefreshTokenRepository(session)

    async def update_name(self, user_id: int, full_name: str) -> UserView:
        async with self._session.begin():
            user = await self._active_user(user_id)
            user.full_name = full_name
            self._session.add(user)
            return UserView(user, await self._users.providers(user.id))

    async def change_password(self, user_id: int, request: ChangePasswordRequest) -> IssuedSession:
        """Нууц үгийг тохируулна эсвэл солино. Бусад бүх нэвтрэлт дуусна (нууц үг солигдсон нь
        хуучныг нь бусад хүн мэдэж болзошгүй гэсэн үг) бөгөөд энэ browser шинэ session авна."""
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
        await self._auth.clear_failures(user.identifier)
        log.info("password_changed", user_id=user_id, had_password=user.password_hash is not None)
        return issued

    async def delete(self, user_id: int, request: DeleteAccountRequest) -> None:
        """Бүртгэлийг нэргүйжүүлнэ. Захиалгууд үлдэнэ (нягтлан бодох бүртгэл, мөн
        `orders.user_id` нь RESTRICT), гэхдээ зөвхөн өөрсдийн snapshot-ийг хадгална: user мөр
        хэн байсныг мөн ингэж хэлэхээ больсон."""
        async with self._session.begin():
            user = await self._active_user(user_id)
        if user.is_admin:
            raise ProblemError(
                HTTPStatus.FORBIDDEN,
                "Administrator accounts cannot be deleted here",
                type_=FORBIDDEN_TYPE,
            )
        if request.confirm != user.identifier:
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Confirmation does not match",
                "Type the email address or phone number of this account to delete it.",
            )
        await self._check_password(user, request.password)
        async with self._session.begin():
            user = await self._active_user(user_id)
            for model in (Address, WishlistItem, Cart, OAuthIdentity):
                await self._session.execute(delete(model).where(model.user_id == user.id))
            await self._tokens.delete_all_for_user(user.id)
            user.email = f"deleted-{user.id}@deleted.invalid"
            user.phone = None
            user.email_verified_at = None
            user.phone_verified_at = None
            user.full_name = DELETED_NAME
            user.password_hash = None
            user.avatar_url = None
            user.is_active = False
            self._session.add(user)
        await self._auth.clear_failures(request.confirm)
        log.info("account_deleted", user_id=user_id)

    # --- төхөөрөмжүүд: нээлттэй нэвтрэлтүүд ---

    async def sessions(self, user_id: int, refresh_token: str | None) -> list[DeviceSession]:
        now = datetime.now(UTC)
        async with self._session.begin():
            current = await self._current_family(user_id, refresh_token)
            rows = await self._tokens.active_sessions(user_id, now)
        return [
            DeviceSession(
                id=token.family_id,
                device=describe_device(token.user_agent),
                ip=token.ip,
                created_at=began,
                last_used_at=token.last_used_at or token.created_at,
                current=token.family_id == current,
            )
            for token, began in rows
        ]

    async def revoke_session(
        self, user_id: int, family_id: uuid.UUID, refresh_token: str | None
    ) -> bool:
        """Нэг нэвтрэлтийг дуусгана. Хүсэлт гаргасан browser-ийн нэвтрэлт бол True."""
        async with self._session.begin():
            current = await self._current_family(user_id, refresh_token)
            ended = await self._tokens.revoke_family_of_user(user_id, family_id, datetime.now(UTC))
        if not ended:
            raise ProblemError(HTTPStatus.NOT_FOUND, "Session not found", "That login is over.")
        return family_id == current

    async def revoke_other_sessions(self, user_id: int, refresh_token: str | None) -> None:
        """ "Бусад бүх газраас гарах": энэ browser-ийн нэвтрэлтээс бусад бүгд."""
        async with self._session.begin():
            current = await self._current_family(user_id, refresh_token)
            if current is None:
                raise ProblemError(
                    HTTPStatus.UNAUTHORIZED,
                    "Not signed in",
                    "Please sign in again.",
                    type_=UNAUTHENTICATED_TYPE,
                    headers={"WWW-Authenticate": "Bearer"},
                )
            await self._tokens.revoke_others(user_id, current, datetime.now(UTC))

    async def _current_family(self, user_id: int, refresh_token: str | None) -> uuid.UUID | None:
        if not refresh_token:
            return None
        row = await self._tokens.get_by_hash(hash_token(refresh_token))
        return row.family_id if row is not None and row.user_id == user_id else None

    # --- утасны дугаар ба email: нэмэх, солих, баталгаажуулах, устгах ---

    async def request_phone(self, user_id: int, raw_phone: str, password: str | None) -> None:
        """Хүн ашиглахыг хүссэн дугаар руу (шинэ эсвэл солих) код илгээнэ."""
        phone = normalize_phone_number(raw_phone, self._settings.default_phone_region)
        user = await self._checked_user(user_id, password)
        if user.phone == phone:
            raise _already_yours("phone number")
        async with self._session.begin():
            if await self._users.get_by_phone(phone) is not None:
                raise _phone_taken()
        await self._otp.issue("change_phone", phone, user_id=user.id)

    async def confirm_phone(self, user_id: int, raw_phone: str, code: str) -> UserView:
        phone = normalize_phone_number(raw_phone, self._settings.default_phone_region)
        await self._otp.verify("change_phone", phone, code, user_id=user_id)
        try:
            async with self._session.begin():
                user = await self._active_user(user_id)
                other = await self._users.get_by_phone(phone)
                if other is not None and other.id != user.id:
                    raise _phone_taken()
                user.phone = phone
                user.phone_verified_at = datetime.now(UTC)
                self._session.add(user)
                await self._session.flush()
                return UserView(user, await self._users.providers(user.id))
        except IntegrityError:  # шалгалт болон бичилтийн хооронд өөр хүн авчихсан
            raise _phone_taken() from None

    async def remove_phone(self, user_id: int, password: str | None) -> UserView:
        user = await self._checked_user(user_id, password)
        async with self._session.begin():
            user = await self._active_user(user_id)
            if user.phone is None:
                return UserView(user, await self._users.providers(user.id))
            if user.email is None:
                raise _last_method("phone number")
            user.phone = None
            user.phone_verified_at = None
            self._session.add(user)
            return UserView(user, await self._users.providers(user.id))

    async def request_email(self, user_id: int, raw_email: str, password: str | None) -> None:
        email = normalize_email(raw_email)
        user = await self._checked_user(user_id, password)
        if user.email == email:
            raise _already_yours("email address")
        async with self._session.begin():
            if await self._users.get_by_email(email) is not None:
                raise _email_taken()
        await self._otp.issue("change_email", email, user_id=user.id)

    async def confirm_email(self, user_id: int, raw_email: str, code: str) -> UserView:
        email = normalize_email(raw_email)
        await self._otp.verify("change_email", email, code, user_id=user_id)
        try:
            async with self._session.begin():
                user = await self._active_user(user_id)
                other = await self._users.get_by_email(email)
                if other is not None and other.id != user.id:
                    raise _email_taken()
                user.email = email
                user.email_verified_at = datetime.now(UTC)
                self._session.add(user)
                await self._session.flush()
                return UserView(user, await self._users.providers(user.id))
        except IntegrityError:
            raise _email_taken() from None

    async def remove_email(self, user_id: int, password: str | None) -> UserView:
        user = await self._checked_user(user_id, password)
        async with self._session.begin():
            user = await self._active_user(user_id)
            if user.email is None:
                return UserView(user, await self._users.providers(user.id))
            if user.phone is None:
                raise _last_method("email address")
            # Нууц үгээр нэвтрэхэд email хэрэгтэй: email-гүй бол нууц үг хэрэггүй ачаа болно.
            user.email = None
            user.email_verified_at = None
            user.password_hash = None
            self._session.add(user)
            return UserView(user, await self._users.providers(user.id))

    async def request_email_verification(self, user_id: int) -> None:
        async with self._session.begin():
            user = await self._active_user(user_id)
        if user.email is None or user.email_verified_at is not None:
            return
        await self._otp.issue("verify_email", user.email, user_id=user.id)

    async def confirm_email_verification(self, user_id: int, code: str) -> UserView:
        async with self._session.begin():
            user = await self._active_user(user_id)
        if user.email is None:
            raise _already_yours("email address")
        await self._otp.verify("verify_email", user.email, code, user_id=user.id)
        async with self._session.begin():
            user = await self._active_user(user_id)
            user.email_verified_at = user.email_verified_at or datetime.now(UTC)
            self._session.add(user)
            return UserView(user, await self._users.providers(user.id))

    # --- туслах функцууд ---

    async def _checked_user(self, user_id: int, password: str | None) -> User:
        """Нэвтэрсэн хэрэглэгч; бүртгэл нууц үгтэй бол нууц үгээ баталгаажуулсан байна."""
        async with self._session.begin():
            user = await self._active_user(user_id)
        await self._check_password(user, password)
        return user

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
        """Нууц үгтэй бүртгэл нотлох ёстой; зөвхөн Google-ийн бүртгэлд нотлох зүйл байхгүй."""
        if user.password_hash is None:
            return
        rate = await self._auth.check_failure_limit(user.identifier)
        if given is None or not await asyncio.to_thread(verify_password, given, user.password_hash):
            await self._auth.record_failure(user.identifier, rate)
            raise _wrong_password()


def _already_yours(what: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.CONFLICT,
        f"That is already your {what}",
        f"Enter a different {what}.",
    )


def _phone_taken() -> ProblemError:
    return ProblemError(
        HTTPStatus.CONFLICT,
        "Phone number already in use",
        "Another account uses this phone number.",
        type_=PHONE_TAKEN_TYPE,
    )


def _email_taken() -> ProblemError:
    return ProblemError(
        HTTPStatus.CONFLICT,
        "Email already registered",
        "Another account uses this email address.",
        type_=EMAIL_TAKEN_TYPE,
    )


def _last_method(what: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.CONFLICT,
        "You need a way to sign in",
        f"Add an email address or a phone number before removing your {what}.",
        type_=LAST_SIGN_IN_METHOD_TYPE,
    )
