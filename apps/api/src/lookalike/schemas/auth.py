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
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Literal["customer", "admin"]


class SessionOut(BaseModel):
    """The access token goes in `Authorization: Bearer` and is kept in memory by the client.
    The refresh token never appears in a body: it is an httpOnly cookie."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth scheme name
    expires_in: int
    user: UserOut


class ProvidersOut(BaseModel):
    """Which ways of signing in besides a password are available, so the page shows only those."""

    google: bool
