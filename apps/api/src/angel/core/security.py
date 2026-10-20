"""Нууц үгийн hash, access token, opaque token.

* Нууц үг: argon2id (argon2-cffi default, RFC 9106 "low memory" profile). Параметр нэмэгдэхэд
  `needs_rehash` нь login үед хуучин hash-ийг шинэчлэх боломж өгнө.
* Access token: богино настай HS256 JWT. Зөвхөн `sub`, `jti`, `iat`, `exp`, `typ` агуулна: бусдыг
  database-аас уншдаг тул role, email өөрчлөлт хэзээ ч хоцрохгүй.
* Refresh, guest-cart token: 256 бит санамсаргүй, зөвхөн SHA-256-г нь хадгална. Entropy өндөр тул
  хурдан hash хангалттай (удаан hash нь зөвхөн login-ийг удаашруулна).
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

ACCESS_TOKEN_TYPE = "access"  # noqa: S105 - claim-ийн утга, нууц биш
JWT_ALGORITHM = "HS256"

_hasher = PasswordHasher()
# Email үл мэдэгдэх үед үүнийг шалгана: "ийм хэрэглэгч алга" нь "нууц үг буруу"-тай адил хугацаа
# зарцуулж, хариуны хугацаанаас бүртгэлтэй email-ийг таашгүй болгоно.
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
    """Жинхэнэ шалгалттай адил хугацаа зарцуулна (email үл мэдэгдэх үед)."""
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
    """Хэрэглэгчийн id; хүчинтэй, хугацаа дуусаагүй access token биш бол None."""
    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],  # header-ийн `alg`-д хэзээ ч бүү итгэ
            options={"require": ["sub", "exp", "iat", "typ"]},
        )
        if claims["typ"] != ACCESS_TOKEN_TYPE:
            return None
        return int(claims["sub"])
    except (jwt.PyJWTError, ValueError):
        return None
