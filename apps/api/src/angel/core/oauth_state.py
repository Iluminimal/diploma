"""Google руу явж буцах нэвтрэлтийн үед ашиглах богино настай cookie.

Буцаж ирэхдээ зөвхөн энэ browser үзүүлж чадах зүйлийг агуулна: `state` (өөр хүний эхлүүлсэн
callback-ийг татгалзахын тулд), `nonce` (ID token-д уяагдана), PKCE verifier, мөн дараа очих
газар. Гарын үсэгтэй token тул server дээр юу ч хадгалахгүй; httpOnly тул script verifier-ийг
хэзээ ч харахгүй.
"""

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass

import jwt

OAUTH_STATE_TYPE = "oauth-flow"
FLOW_TTL_SECONDS = 600
_ALGORITHM = "HS256"


@dataclass(frozen=True)
class OAuthFlow:
    state: str
    nonce: str
    verifier: str
    next_path: str


def new_flow(next_path: str) -> OAuthFlow:
    return OAuthFlow(
        state=secrets.token_urlsafe(24),
        nonce=secrets.token_urlsafe(24),
        verifier=secrets.token_urlsafe(48),
        next_path=next_path,
    )


def code_challenge(verifier: str) -> str:
    """PKCE S256: verifier-ийн SHA-256-г base64url болгосон, padding-гүй."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def sign_flow(flow: OAuthFlow, secret: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {
            "typ": OAUTH_STATE_TYPE,
            "st": flow.state,
            "no": flow.nonce,
            "cv": flow.verifier,
            "nx": flow.next_path,
            "iat": now,
            "exp": now + FLOW_TTL_SECONDS,
        },
        secret,
        algorithm=_ALGORITHM,
    )


def read_flow(token: str | None, secret: str) -> OAuthFlow | None:
    """Байхгүй, хуурамч, хугацаа дууссан, эсвэл өөр төрлийн token бол None."""
    if not token:
        return None
    try:
        claims = jwt.decode(token, secret, algorithms=[_ALGORITHM], options={"require": ["exp"]})
    except jwt.PyJWTError:
        return None
    if claims.get("typ") != OAUTH_STATE_TYPE:
        return None
    try:
        return OAuthFlow(
            state=str(claims["st"]),
            nonce=str(claims["no"]),
            verifier=str(claims["cv"]),
            next_path=str(claims["nx"]),
        )
    except KeyError:
        return None


def states_match(expected: str, presented: str | None) -> bool:
    return presented is not None and hmac.compare_digest(expected, presented)


def safe_next(value: str | None) -> str:
    """Нэвтэрсний дараах очих газар: зөвхөн энэ сайтын зам, ингэснээр `?next=//evil.example` нь
    login-ийг open redirect болгож чадахгүй. Вэб апп дахь `safeNext`-тэй адил."""
    if (
        not value
        or len(value) > 500
        or not value.startswith("/")
        or value.startswith("//")
        or "\\" in value
        or any(ord(char) < 32 for char in value)
    ):
        return "/"
    first = value.split("?", 1)[0].rstrip("/")
    if first in {"/login", "/register"}:
        return "/"
    return value
