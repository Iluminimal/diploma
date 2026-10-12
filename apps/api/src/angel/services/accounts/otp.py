"""One-time codes: sent to a phone number or an email address, good for one purpose, a few
minutes and a few guesses.

Only an HMAC of the code is stored. Every step runs in the database (not Redis), so a lost cache
can never let a code through, and `issue` / `verify` each use their own transaction: a wrong guess
is counted even though the request that made it fails.
"""

import hashlib
import hmac
import math
import secrets
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from typing import Literal

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import (
    INVALID_DESTINATION_TYPE,
    OTP_EXPIRED_TYPE,
    OTP_INVALID_TYPE,
    OTP_TOO_MANY_ATTEMPTS_TYPE,
    SMS_UNAVAILABLE_TYPE,
    ProblemError,
)
from angel.core.logging import get_logger
from angel.core.mail import Email, Mailer
from angel.core.phone import InvalidPhoneError, normalize_phone
from angel.core.rate_limit import RATE_LIMITED_TYPE
from angel.core.sms import Sms, SmsDeliveryError, SmsSender
from angel.repositories.accounts.otp import OtpRepository

log = get_logger(__name__)

OtpPurpose = Literal[
    "login", "verify_email", "verify_phone", "change_email", "change_phone", "reset_password"
]

_EMAIL = TypeAdapter(EmailStr)

_SUBJECTS: dict[str, str] = {
    "login": "Your Angel sign-in code",
    "verify_email": "Confirm your email for Angel",
    "verify_phone": "Confirm your phone for Angel",
    "change_email": "Confirm your new email for Angel",
    "change_phone": "Confirm your new phone for Angel",
    "reset_password": "Reset your Angel password",
}


def is_phone(destination: str) -> bool:
    """Normalised destinations are E.164 numbers (start with `+`) or lower-case emails."""
    return destination.startswith("+")


def normalize_destination(raw: str, default_region: str) -> str:
    """The canonical form of what the person typed: an E.164 number or a lower-case email."""
    text = raw.strip()
    try:
        if "@" in text:
            return str(_EMAIL.validate_python(text)).lower()
        return normalize_phone(text, default_region)
    except (ValidationError, InvalidPhoneError):
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Not a valid phone number or email",
            "Enter a valid phone number or email address.",
            type_=INVALID_DESTINATION_TYPE,
        ) from None


def normalize_phone_number(raw: str, default_region: str) -> str:
    try:
        return normalize_phone(raw.strip(), default_region)
    except InvalidPhoneError:
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Not a valid phone number",
            "Enter a valid phone number.",
            type_=INVALID_DESTINATION_TYPE,
        ) from None


def normalize_email(raw: str) -> str:
    try:
        return str(_EMAIL.validate_python(raw.strip())).lower()
    except ValidationError:
        raise ProblemError(
            HTTPStatus.UNPROCESSABLE_ENTITY,
            "Not a valid email",
            "Enter a valid email address.",
            type_=INVALID_DESTINATION_TYPE,
        ) from None


def _invalid() -> ProblemError:
    return ProblemError(
        HTTPStatus.BAD_REQUEST,
        "That code is not right",
        "Check the code and try again, or ask for a new one.",
        type_=OTP_INVALID_TYPE,
    )


class OtpService:
    def __init__(
        self,
        session: AsyncSession,
        settings: Settings,
        secret: str,
        mailer: Mailer,
        sms: SmsSender,
    ) -> None:
        self._session = session
        self._settings = settings
        self._secret = secret.encode()
        self._mailer = mailer
        self._sms = sms
        self._otps = OtpRepository(session)

    async def issue(
        self,
        purpose: OtpPurpose,
        destination: str,
        *,
        user_id: int | None = None,
        deliver: bool = True,
    ) -> None:
        """Create a code and send it. `deliver=False` records the challenge but sends nothing: for
        "forgot password" on an unknown address, which must look exactly like a known one."""
        now = datetime.now(UTC)
        code = self._settings.otp_dev_code or f"{secrets.randbelow(10**6):06d}"
        resend = self._settings.otp_resend_seconds
        async with self._session.begin():
            last = await self._otps.latest(purpose, destination)
            if last is not None:
                # created_at is the database clock: a tiny negative age is just clock skew.
                age = max(0.0, (now - last.created_at).total_seconds())
                wait = math.ceil(resend - age)
                if wait > 0:
                    raise _too_soon(wait)
            recent = await self._otps.count_since(destination, now - timedelta(hours=1))
            if recent >= self._settings.otp_max_sends_per_hour:
                raise _too_soon(3600, "Too many codes were sent to this address. Try again later.")
            await self._otps.consume_open(purpose, destination, now)
            await self._otps.add(
                purpose=purpose,
                destination=destination,
                user_id=user_id,
                code_hash=self._hash(purpose, destination, code),
                expires_at=now + timedelta(seconds=self._settings.otp_ttl_seconds),
            )
        if deliver:
            await self._deliver(purpose, destination, code)

    async def verify(
        self,
        purpose: OtpPurpose,
        destination: str,
        code: str,
        *,
        user_id: int | None = None,
    ) -> int | None:
        """Check a code and use it up. Returns the user id the challenge was issued for (None for
        login and reset). `user_id` pins the challenge to the signed-in person who asked for it."""
        now = datetime.now(UTC)
        failure: ProblemError | None = None
        owner: int | None = None
        async with self._session.begin():
            row = await self._otps.latest_open_for_update(purpose, destination)
            if row is None:
                failure = _invalid()
            elif row.expires_at <= now:
                row.consumed_at = now
                failure = ProblemError(
                    HTTPStatus.BAD_REQUEST,
                    "That code has expired",
                    "Ask for a new code.",
                    type_=OTP_EXPIRED_TYPE,
                )
            elif user_id is not None and row.user_id != user_id:
                failure = _invalid()
            elif not hmac.compare_digest(row.code_hash, self._hash(purpose, destination, code)):
                row.attempts += 1
                if row.attempts >= self._settings.otp_max_attempts:
                    row.consumed_at = now
                    failure = _too_many_attempts()
                else:
                    failure = _invalid()
            else:
                row.consumed_at = now
                owner = row.user_id
        # Raised after the block, so the counted attempt is committed.
        if failure is not None:
            log.info("otp_rejected", purpose=purpose, reason=failure.type)
            raise failure
        return owner

    # --- helpers --------------------------------------------------------------------------

    def _hash(self, purpose: str, destination: str, code: str) -> str:
        message = f"{purpose}\x00{destination}\x00{code}".encode()
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()

    async def _deliver(self, purpose: OtpPurpose, destination: str, code: str) -> None:
        minutes = max(1, self._settings.otp_ttl_seconds // 60)
        if is_phone(destination):
            body = f"{code} is your Angel code. It expires in {minutes} minutes. Don't share it."
            try:
                await self._sms.send(Sms(to=destination, body=body))
            except SmsDeliveryError:
                raise ProblemError(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    "We couldn't send the text message",
                    "Try again in a moment.",
                    type_=SMS_UNAVAILABLE_TYPE,
                ) from None
            return
        await self._mailer.send(
            Email(
                to=destination,
                subject=_SUBJECTS[purpose],
                body=(
                    f"Your code is {code}. It expires in {minutes} minutes.\n"
                    "If you didn't ask for it, you can ignore this email."
                ),
            )
        )


def _too_soon(seconds: int, detail: str | None = None) -> ProblemError:
    return ProblemError(
        HTTPStatus.TOO_MANY_REQUESTS,
        "Please wait before asking for another code",
        detail or f"You can ask for a new code in {seconds} s.",
        type_=RATE_LIMITED_TYPE,
        headers={"Retry-After": str(seconds)},
    )


def _too_many_attempts() -> ProblemError:
    return ProblemError(
        HTTPStatus.TOO_MANY_REQUESTS,
        "Too many wrong codes",
        "Ask for a new code.",
        type_=OTP_TOO_MANY_ATTEMPTS_TYPE,
    )
