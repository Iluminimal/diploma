"""Дэлгүүрт төлбөрийн provider-аас хэрэгтэй зүйл, Stripe-ээс хамаарахгүй.

Service-үүд зөвхөн энэ protocol-оос хамаарна. `StripeGateway` Stripe-тай ярина; `OfflineGateway`
нь key-гүй хөгжүүлэлт, тестэд зориулсан процесс доторх орлуулагч.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

PaymentEventKind = Literal["succeeded", "failed", "canceled"]


class PaymentProviderError(Exception):
    """Provider-тэй холбогдсонгүй эсвэл дуудлагыг татгалзсан. Дахин оролдоход аюулгүй."""


class InvalidSignatureError(Exception):
    """Provider гарын үсэг зураагүй (эсвэл буруу бүтэцтэй) webhook body."""


@dataclass(frozen=True)
class IntentInfo:
    id: str
    client_secret: str
    status: str


@dataclass(frozen=True)
class PaymentEvent:
    """Захиалгын логикт хэрэгтэй зүйл болгон хураасан provider webhook."""

    id: str
    kind: PaymentEventKind
    intent_id: str
    amount_cents: int
    currency: str
    message: str | None = None


class PaymentGateway(Protocol):
    mode: Literal["stripe", "offline"]

    async def create_intent(
        self, *, amount_cents: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        """Нэг захиалгын төлбөрийг үүсгэнэ (`idempotency_key` давтагдвал өмнөхийг нь буцаана)."""
        ...

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        """Төлөгдөөгүй intent-ийг цуцлана. "succeeded" бол ээлжид төлөгдчихсөн гэсэн үг."""
        ...

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        """Төлөгдсөн intent-ийг бүтнээр нь буцаан олгоно; refund id буцаана."""
        ...

    def parse_event(self, payload: bytes, signature: str | None) -> PaymentEvent | None:
        """Webhook-ийг шалгаж задлана. Бидний боловсруулдаггүй event төрөлд None."""
        ...
