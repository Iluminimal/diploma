from angel.core.config import Settings
from angel.payments.gateway import PaymentGateway
from angel.payments.offline import OfflineGateway
from angel.payments.qpay_gateway import QPayGateway


def build_gateway(settings: Settings) -> PaymentGateway | None:
    """None бол төлбөр тохируулаагүй: checkout 503 буцаана, дэлгүүрийн бусад хэсэг ажиллана."""
    if settings.payments_mode == "offline":
        return OfflineGateway()
    if settings.qpay_client_id and settings.qpay_client_secret and settings.qpay_invoice_code:
        return QPayGateway(
            base_url=settings.qpay_base_url,
            client_id=settings.qpay_client_id,
            client_secret=settings.qpay_client_secret,
            invoice_code=settings.qpay_invoice_code,
            callback_base_url=settings.qpay_callback_base_url,
            api_prefix=settings.api_v1_prefix,
        )
    return None
