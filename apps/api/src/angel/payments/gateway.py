"""Дэлгүүрт төлбөрийн provider-аас хэрэгтэй зүйл, тодорхой provider-оос хамаарахгүй.

Service-үүд зөвхөн энэ protocol-оос хамаарна. `QPayGateway` QPay-тэй ярина; `OfflineGateway` нь
түлхүүргүй хөгжүүлэлт, тестэд зориулсан процесс доторх орлуулагч.

Мөнгөн дүн бүр тухайн валютын минор нэгжээр (USD cent, MNT мөнгө = төгрөг x 100), бүхэл тоогоор.
"""

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

PaymentMode = Literal["qpay", "offline"]


class PaymentProviderError(Exception):
    """Provider-тэй холбогдсонгүй эсвэл дуудлагыг татгалзсан. Дахин оролдоход аюулгүй."""


@dataclass(frozen=True)
class IntentInfo:
    """Provider дээр үүссэн нэг төлбөр (QPay-д нэхэмжлэх). `checkout` нь browser-т төлөхөд
    хэрэгтэй зүйл (QPay: QR зураг, банкны апп-ын холбоос); offline-д хоосон."""

    id: str
    status: str
    checkout: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PaymentEvent:
    """Provider дээр баталгаажсан төлбөр. `amount`, `currency` нь provider бодитоор авсан дүн
    (минор нэгжээр): settlement үүнийг төлбөрийн түгжсэн дүнтэй харьцуулна."""

    id: str
    intent_id: str
    amount: int
    currency: str
    kind: Literal["succeeded"] = "succeeded"


class PaymentGateway(Protocol):
    mode: PaymentMode
    # Provider ямар валютаар мөнгө авдаг вэ (QPay: зөвхөн MNT). None бол дэлгүүрийн үндсэн валют.
    charge_currency: str | None

    async def create_intent(
        self, *, amount: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        """Нэг захиалгын төлбөрийг үүсгэнэ (`idempotency_key` давтагдвал өмнөхийг нь буцаана)."""
        ...

    async def check(self, intent_id: str) -> PaymentEvent | None:
        """Provider-оос төлбөрийн төлвийг асууна. Төлөгдсөн бол event, үгүй бол None."""
        ...

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        """Төлөгдөөгүй төлбөрийг цуцлана. "succeeded" бол ээлжид төлөгдчихсөн гэсэн үг."""
        ...

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        """Төлөгдсөн төлбөрийг бүтнээр нь буцаан олгоно; refund id буцаана."""
        ...
