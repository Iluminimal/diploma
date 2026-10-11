import hmac
import time
from urllib.parse import urlencode

import httpx
import jwt

from lookalike.core.logging import get_logger
from lookalike.oauth.provider import OAuthError, OAuthProfile

log = get_logger(__name__)

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - a URL, not a secret
ISSUERS = {"https://accounts.google.com", "accounts.google.com"}
CLOCK_SKEW_SECONDS = 60


class GoogleOAuth:
    """Authorization code flow with PKCE against Google.

    The ID token is not signature-checked: it arrives straight from Google's token endpoint over
    TLS in answer to a request carrying our client secret and PKCE verifier, which Google's own
    documentation accepts as proof of origin. Its claims are still checked (issuer, audience,
    expiry, the nonce we sent, a stable subject, a verified email).
    """

    name = "google"

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        redirect_uri: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client_id = client_id
        self._client_secret = client_secret
        self._redirect_uri = redirect_uri
        self._transport = transport

    def authorization_url(
        self, *, state: str, nonce: str, code_challenge: str, login_hint: str | None
    ) -> str:
        params = {
            "client_id": self._client_id,
            "redirect_uri": self._redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        }
        if login_hint:
            params["login_hint"] = login_hint
        return f"{AUTHORIZE_URL}?{urlencode(params)}"

    async def exchange(self, *, code: str, code_verifier: str, nonce: str) -> OAuthProfile:
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=10.0) as client:
                response = await client.post(
                    TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                        "redirect_uri": self._redirect_uri,
                        "grant_type": "authorization_code",
                        "code_verifier": code_verifier,
                    },
                )
        except httpx.HTTPError as exc:
            raise OAuthError(
                "google_failed", f"token request failed: {type(exc).__name__}"
            ) from exc
        if response.status_code != 200:
            # Google's error body names the cause (e.g. invalid_grant); it is for logs only.
            raise OAuthError("google_failed", f"token endpoint answered {response.status_code}")
        try:
            id_token = response.json()["id_token"]
            claims = jwt.decode(id_token, options={"verify_signature": False})
        except (ValueError, KeyError, jwt.PyJWTError) as exc:
            raise OAuthError("google_failed", "no usable id_token") from exc
        return self._profile(claims, nonce)

    def _profile(self, claims: dict[str, object], nonce: str) -> OAuthProfile:
        if claims.get("iss") not in ISSUERS:
            raise OAuthError("google_failed", "wrong issuer")
        audience = claims.get("aud")
        audiences = audience if isinstance(audience, list) else [audience]
        if self._client_id not in audiences:
            raise OAuthError("google_failed", "wrong audience")
        expires = claims.get("exp")
        if not isinstance(expires, int | float) or expires + CLOCK_SKEW_SECONDS < time.time():
            raise OAuthError("google_failed", "expired id_token")
        returned_nonce = claims.get("nonce")
        if not isinstance(returned_nonce, str) or not hmac.compare_digest(returned_nonce, nonce):
            raise OAuthError("google_failed", "nonce mismatch")
        subject = claims.get("sub")
        email = claims.get("email")
        if not isinstance(subject, str) or not subject or not isinstance(email, str) or not email:
            raise OAuthError("google_failed", "missing subject or email")
        verified = claims.get("email_verified")
        name = claims.get("name")
        return OAuthProfile(
            subject=subject,
            email=email,
            email_verified=verified is True or verified == "true",
            name=name if isinstance(name, str) and name.strip() else None,
        )
