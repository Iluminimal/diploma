from angel.core.config import Settings
from angel.payments.gateway import PaymentGateway
from angel.payments.offline import OfflineGateway
from angel.payments.stripe_gateway import StripeGateway


def build_gateway(settings: Settings) -> PaymentGateway | None:
    """None means payments are not configured: checkout answers 503, the rest of the shop works."""
    if settings.payments_mode == "offline":
        return OfflineGateway(settings.stripe_webhook_secret)
    if settings.stripe_secret_key:
        return StripeGateway(settings.stripe_secret_key, settings.stripe_webhook_secret)
    return None
