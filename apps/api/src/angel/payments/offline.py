import secrets
from typing import Literal

from angel.payments.gateway import IntentInfo, PaymentEvent
from angel.payments.stripe_gateway import parse_stripe_event


class OfflineGateway:
    """Stripe key-гүй хөгжүүлэлт (`PAYMENTS_MODE=offline`) ба тестийн орлуулагч.

    Процессоос юу ч гарахгүй: intent-үүд зохиомол, худалдан авагч simulate endpoint-оор "төлнө".
    Энэ нь жинхэнэ webhook-ийн хүрдэг settlement кодыг ажиллуулна. Тохируулсан secret-ээр
    гарын үсэг зурсан webhook-ийг Stripe-ийнхтэй яг адил шалгана, тиймээс локалд дахин тоглуулж
    болно. Production-д хэзээ ч зөвшөөрөхгүй (`Settings`-ийг хар).
    """

    mode: Literal["stripe", "offline"] = "offline"

    def __init__(self, webhook_secret: str = "") -> None:
        self._webhook_secret = webhook_secret

    async def create_intent(
        self, *, amount_cents: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        # Key-ээс гаргана: давтагдсан хүсэлт Stripe-ийнх шиг ижил intent авна.
        suffix = idempotency_key.replace("-", "")[:24] or secrets.token_hex(12)
        return IntentInfo(
            f"pi_offline_{suffix}", f"pi_offline_{suffix}_secret_offline", "requires_payment"
        )

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        return "canceled"

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        return f"re_offline_{idempotency_key[:24]}"

    def parse_event(self, payload: bytes, signature: str | None) -> PaymentEvent | None:
        return parse_stripe_event(payload, signature, self._webhook_secret)
