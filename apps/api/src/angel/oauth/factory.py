from angel.core.config import Settings
from angel.oauth.fake import FakeOAuth
from angel.oauth.google import GoogleOAuth
from angel.oauth.provider import OAuthProvider


def build_oauth_provider(settings: Settings) -> OAuthProvider | None:
    """None бол Google-ээр нэвтрэх тохируулаагүй: товчийг нууна, бусад нь хэвийн ажиллана."""
    if settings.oauth_mode == "fake":
        return FakeOAuth(settings.google_redirect_uri)
    if settings.google_client_id and settings.google_client_secret:
        return GoogleOAuth(
            settings.google_client_id, settings.google_client_secret, settings.google_redirect_uri
        )
    return None
