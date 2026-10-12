import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# Length is the only rule: composition rules ("one digit, one symbol") push people to weaker,
# predictable passwords. 10 characters is the floor, 128 keeps hashing time bounded.
Password = Annotated[str, Field(min_length=10, max_length=128)]


def _normalise_email(value: str) -> str:
    return value.strip().lower()


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: Password
    full_name: FullName

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return _normalise_email(value)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Not EmailStr and not length-checked beyond a cap: a malformed address must fail like a
    # wrong one, not with a different error.
    email: Annotated[str, Field(min_length=1, max_length=320)]
    password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return _normalise_email(value)


class UserOut(BaseModel):
    id: int
    # An account made with a phone number has no email until it adds one, and the other way round.
    email: str | None
    phone: str | None
    email_verified: bool
    phone_verified: bool
    full_name: str
    role: Literal["customer", "admin"]
    avatar_url: str | None
    # False for accounts that only sign in with Google (they may add one on the profile page).
    has_password: bool
    # Sign-in providers linked to the account, e.g. ["google"].
    providers: list[str]


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: FullName


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Required when the account has a password; Google-only accounts leave it out.
    current_password: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    new_password: Password


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The account's email (or phone number, if it has no email) typed back by the person, so a
    # stolen tab cannot delete an account with one click.
    confirm: Annotated[str, Field(min_length=1, max_length=320)]
    password: Annotated[str, Field(min_length=1, max_length=128)] | None = None

    @field_validator("confirm", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return _normalise_email(value)


class SessionOut(BaseModel):
    """The access token goes in `Authorization: Bearer` and is kept in memory by the client.
    The refresh token never appears in a body: it is an httpOnly cookie."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth scheme name
    expires_in: int
    user: UserOut
    # True when this sign-in just created the account (a new phone number or email): the page
    # then asks for a name.
    is_new_user: bool = False


class ProvidersOut(BaseModel):
    """Which ways of signing in besides a password are available, so the page shows only those."""

    google: bool


Destination = Annotated[str, Field(min_length=3, max_length=320)]
OtpCode = Annotated[str, Field(pattern=r"^[0-9]{6}$")]


class OtpRequest(BaseModel):
    """Ask for a sign-in code. `destination` is a phone number (any common spelling) or an email."""

    model_config = ConfigDict(extra="forbid")

    destination: Destination


class OtpVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: Destination
    code: OtpCode


CurrentPassword = Annotated[str, Field(min_length=1, max_length=128)] | None


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: Destination


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: Destination
    code: OtpCode
    new_password: Password


class VerifyCodeRequest(BaseModel):
    """The code that confirms an address or number the signed-in person already holds."""

    model_config = ConfigDict(extra="forbid")

    code: OtpCode


class PhoneChangeRequest(BaseModel):
    """Add a phone number or replace the current one: a code is sent to the new number."""

    model_config = ConfigDict(extra="forbid")

    phone: Annotated[str, Field(min_length=3, max_length=40)]
    # Required when the account has a password.
    current_password: CurrentPassword = None


class PhoneConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: Annotated[str, Field(min_length=3, max_length=40)]
    code: OtpCode


class EmailChangeRequest(BaseModel):
    """Add an email address or replace the current one: a code is sent to the new address."""

    model_config = ConfigDict(extra="forbid")

    email: Annotated[str, Field(min_length=3, max_length=320)]
    current_password: CurrentPassword = None


class EmailConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Annotated[str, Field(min_length=3, max_length=320)]
    code: OtpCode


class RemoveContactRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: CurrentPassword = None


class DeviceSession(BaseModel):
    """One open login of the account, as the "your devices" list shows it."""

    id: uuid.UUID
    device: str
    ip: str | None
    created_at: datetime
    last_used_at: datetime
    # The login this request belongs to.
    current: bool
