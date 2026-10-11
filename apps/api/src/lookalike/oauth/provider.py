from dataclasses import dataclass
from typing import Protocol


class OAuthError(Exception):
    """The provider's answer cannot be trusted or used. `reason` is one of the codes the login
    page knows ("google_failed", "google_unverified"); nothing else about it is shown."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason


@dataclass(frozen=True)
class OAuthProfile:
    subject: str
    email: str
    email_verified: bool
    name: str | None


class OAuthProvider(Protocol):
    name: str

    def authorization_url(
        self, *, state: str, nonce: str, code_challenge: str, login_hint: str | None
    ) -> str:
        """Where to send the browser to sign in."""
        ...

    async def exchange(self, *, code: str, code_verifier: str, nonce: str) -> OAuthProfile:
        """Trade the authorization code for who signed in. Raises `OAuthError`."""
        ...
