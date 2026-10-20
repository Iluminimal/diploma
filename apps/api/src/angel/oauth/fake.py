import base64
import hashlib
import json
from urllib.parse import urlencode

from angel.oauth.provider import OAuthError, OAuthProfile

DEFAULT_EMAIL = "fake-google-user@example.com"
UNVERIFIED_PREFIX = "unverified:"
# `ada@example.com;picture=https://example.com/ada.png` гэж өгвөл хуурамч хэрэглэгч зурагтай болно.
PICTURE_MARK = ";picture="


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


class FakeOAuth:
    """Google-гүй Google, тест болон CI-д зориулсан (`OAUTH_MODE=fake`, prod хүлээн авахгүй).

    "Нэвтрэх" нь зөвшөөрлийн дэлгэцийг алгасна: authorization URL нь callback өөрөө бөгөөд хэн
    нэвтэрснийг агуулсан code-той. `login_hint` нь email-ийг сонгоно (default
    `fake-google-user@example.com`); `unverified:<email>` гэвэл баталгаажаагүй email болох ба
    service үүнийг татгалзах ёстой.
    """

    name = "google"

    def __init__(self, redirect_uri: str) -> None:
        self._redirect_uri = redirect_uri

    def authorization_url(
        self, *, state: str, nonce: str, code_challenge: str, login_hint: str | None
    ) -> str:
        hint, _, picture = (login_hint or DEFAULT_EMAIL).partition(PICTURE_MARK)
        verified = not hint.startswith(UNVERIFIED_PREFIX)
        email = hint.removeprefix(UNVERIFIED_PREFIX).lower()
        # Email бүрт тогтвортой subject, Google-ийнх шиг: нэг хүн үргэлж нэг хэрэглэгчээр нэвтэрнэ.
        subject = "fake-" + hashlib.sha256(email.encode()).hexdigest()[:20]
        name = email.split("@")[0].replace(".", " ").replace("-", " ").title()
        claims = {
            "sub": subject,
            "email": email,
            "verified": verified,
            "name": name,
            "picture": picture or None,
        }
        code = _b64(json.dumps(claims).encode())
        return f"{self._redirect_uri}?{urlencode({'code': code, 'state': state})}"

    async def exchange(self, *, code: str, code_verifier: str, nonce: str) -> OAuthProfile:
        try:
            claims = json.loads(base64.urlsafe_b64decode(code + "=" * (-len(code) % 4)))
            return OAuthProfile(
                subject=str(claims["sub"]),
                email=str(claims["email"]),
                email_verified=bool(claims["verified"]),
                name=str(claims["name"]),
                picture=claims.get("picture"),
            )
        except (ValueError, KeyError, TypeError) as exc:
            raise OAuthError("google_failed", "not a fake code") from exc
