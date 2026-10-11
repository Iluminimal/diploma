import base64
import hashlib
import json
from urllib.parse import urlencode

from lookalike.oauth.provider import OAuthError, OAuthProfile

DEFAULT_EMAIL = "fake-google-user@example.com"
UNVERIFIED_PREFIX = "unverified:"
# `ada@example.com;picture=https://example.com/ada.png` gives the fake user a photo.
PICTURE_MARK = ";picture="


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


class FakeOAuth:
    """Google without Google, for tests and CI (`OAUTH_MODE=fake`, refused in prod).

    "Signing in" skips the consent screen: the authorization URL is the callback itself, with a
    code that spells out who signed in. `login_hint` picks the email (default
    `fake-google-user@example.com`); a hint of `unverified:<email>` yields an unverified email,
    which the service must refuse.
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
        # A stable subject per email, like Google's: the same person signs in as the same user.
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
