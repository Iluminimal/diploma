from dataclasses import dataclass
from typing import Protocol


class OAuthError(Exception):
    """Provider-ийн хариуг итгэж ч, ашиглаж ч болохгүй. `reason` нь login хуудасны мэддэг кодуудын
    нэг ("google_failed", "google_unverified"); өөр юу ч харуулахгүй."""

    def __init__(self, reason: str, detail: str = "") -> None:
        super().__init__(detail or reason)
        self.reason = reason


@dataclass(frozen=True)
class OAuthProfile:
    subject: str
    email: str
    email_verified: bool
    name: str | None
    # Provider хэрэгэмжтэй зураг өгсөн бол хүний зургийн https URL.
    picture: str | None = None


class OAuthProvider(Protocol):
    name: str

    def authorization_url(
        self, *, state: str, nonce: str, code_challenge: str, login_hint: str | None
    ) -> str:
        """Нэвтрэхийн тулд browser-ийг хаашаа илгээх."""
        ...

    async def exchange(self, *, code: str, code_verifier: str, nonce: str) -> OAuthProfile:
        """Authorization code-оор хэн нэвтэрснийг авна. `OAuthError` шидэж болно."""
        ...
