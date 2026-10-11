from lookalike.core.config import Settings
from lookalike.oauth.fake import FakeOAuth
from lookalike.oauth.google import GoogleOAuth
from lookalike.oauth.provider import OAuthProvider


def build_oauth_provider(settings: Settings) -> OAuthProvider | None:
    """None means sign-in with Google is not configured: the button is hidden, the rest works."""
    if settings.oauth_mode == "fake":
        return FakeOAuth(settings.google_redirect_uri)
    if settings.google_client_id and settings.google_client_secret:
        return GoogleOAuth(
            settings.google_client_id, settings.google_client_secret, settings.google_redirect_uri
        )
    return None
