"""ML/ingestion тестүүдийн test double ба зургийн туслахууд."""

import re
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image

from angel.core.mail import Email
from angel.core.sms import Sms
from angel.payments import IntentInfo, PaymentProviderError
from angel.payments.offline import OfflineGateway


def write_jpeg(path: Path, seed: int, size: tuple[int, int] = (300, 400)) -> None:
    """Seed бүрт өөр, тогтмол JPEG (өнгөт дэвсгэр дээрх санамсаргүй блокууд)."""
    rng = np.random.default_rng(seed)
    pixels = rng.integers(0, 256, size=(size[1], size[0], 3), dtype=np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels).save(path, format="JPEG", quality=90)


class RecordingGateway(OfflineGateway):
    """Offline gateway ба shop түүнээс юу хүссэнийг бичдэг бүртгэл; жинхэнэ provider-ийн адил
    алдаа гаргах сэлгүүртэй.
    """

    def __init__(self, webhook_secret: str = "") -> None:
        super().__init__(webhook_secret)
        self.created: list[dict[str, object]] = []
        self.cancelled: list[str] = []
        self.refunds: list[str] = []
        self.fail_create = False
        self.fail_cancel = False
        self.fail_refund = False
        # cancel_intent юу буцаахыг заана: "succeeded" бол худалдан авагч завсарт төлсөн гэсэн үг.
        self.cancel_outcome: Literal["canceled", "succeeded"] = "canceled"

    async def create_intent(
        self, *, amount_cents: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        if self.fail_create:
            raise PaymentProviderError("simulated outage")
        self.created.append({"amount": amount_cents, "order": order_number, "key": idempotency_key})
        return await super().create_intent(
            amount_cents=amount_cents,
            currency=currency,
            order_number=order_number,
            idempotency_key=idempotency_key,
        )

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        if self.fail_cancel:
            raise PaymentProviderError("simulated outage")
        self.cancelled.append(intent_id)
        return self.cancel_outcome

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        if self.fail_refund:
            raise PaymentProviderError("simulated outage")
        self.refunds.append(intent_id)
        return await super().refund(intent_id, idempotency_key=idempotency_key)


class RecordingMailer:
    def __init__(self) -> None:
        self.sent: list[Email] = []

    async def send(self, email: Email) -> None:
        self.sent.append(email)


class RecordingSmsSender:
    """Бүх мессежийг хадгалдаг тул тест нэг удаагийн кодыг эндээс уншина."""

    def __init__(self) -> None:
        self.sent: list[Sms] = []

    async def send(self, sms: Sms) -> None:
        self.sent.append(sms)

    def last_code(self) -> str:
        match = re.search(r"\b(\d{6})\b", self.sent[-1].body)
        assert match, self.sent[-1].body
        return match.group(1)
