import secrets
from typing import Literal

from angel.payments.gateway import IntentInfo, PaymentEvent, PaymentMode


class OfflineGateway:
    """Provider-гүй хөгжүүлэлт (`PAYMENTS_MODE=offline`) ба тестийн орлуулагч.

    Процессоос юу ч гарахгүй: төлбөрүүд зохиомол, худалдан авагч simulate endpoint-оор "төлнө".
    Энэ нь жинхэнэ provider-ийн хүрдэг settlement кодыг ажиллуулна. Дэлгүүрийн үндсэн валютаар
    (USD) мөнгө авна. Production-д хэзээ ч зөвшөөрөхгүй (`Settings`-ийг хар).
    """

    mode: PaymentMode = "offline"
    charge_currency: str | None = None

    async def create_intent(
        self, *, amount: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        # Key-ээс гаргана: давтагдсан хүсэлт ижил төлбөр авна.
        suffix = idempotency_key.replace("-", "")[:24] or secrets.token_hex(12)
        return IntentInfo(f"pay_offline_{suffix}", "requires_payment")

    async def check(self, intent_id: str) -> PaymentEvent | None:
        # Offline-д төлбөр зөвхөн simulate endpoint-оор ордог.
        return None

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        return "canceled"

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        return f"re_offline_{idempotency_key[:24]}"
