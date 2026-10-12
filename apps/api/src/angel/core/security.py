"""Password hashing, access tokens and opaque tokens.

* Passwords: argon2id (argon2-cffi defaults, RFC 9106 "low memory" profile). `needs_rehash`
  lets login upgrade old hashes when the parameters are raised.
* Access tokens: short-lived HS256 JWTs. Only `sub`, `jti`, `iat`, `exp` and `typ` are in them:
  everything else is read from the database, so a role or email change is never stale.
* Refresh and guest-cart tokens: 256 random bits, only their SHA-256 is stored. They are
  high-entropy, so a fast hash is enough (a slow one would only add login latency).
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

ACCESS_TOKEN_TYPE = "access"  # noqa: S105 - a claim value, not a secret
JWT_ALGORITHM = "HS256"

_hasher = PasswordHasher()
# Verified against when the email is unknown, so "no such user" costs as much as "wrong
# password" and response time does not reveal which emails are registered.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def burn_password_check(password: str) -> None:
    """Spend the same time as a real verification (unknown email)."""
    verify_password(password, _DUMMY_HASH)


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class AccessToken:
    value: str
    expires_in: int


def create_access_token(
    user_id: int, secret: str, ttl_seconds: int, *, now: datetime | None = None
) -> AccessToken:
    issued = now or datetime.now(UTC)
    claims = {
        "sub": str(user_id),
        "jti": uuid.uuid4().hex,
        "typ": ACCESS_TOKEN_TYPE,
        "iat": issued,
        "exp": issued + timedelta(seconds=ttl_seconds),
    }
    return AccessToken(jwt.encode(claims, secret, algorithm=JWT_ALGORITHM), ttl_seconds)


def decode_access_token(token: str, secret: str) -> int | None:
    """The user id, or None for anything that is not a valid, unexpired access token."""
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],  # never trust the header's `alg`
            options={"require": ["sub", "exp", "iat", "typ"]},
        )
        if claims["typ"] != ACCESS_TOKEN_TYPE:
            return None
        return int(claims["sub"])
    except (jwt.PyJWTError, ValueError):
        return None
