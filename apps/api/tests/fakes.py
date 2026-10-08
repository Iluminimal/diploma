"""Test doubles and image helpers for the ML/ingestion tests."""

import hashlib
from collections.abc import Sequence
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image

from lookalike.core.mail import Email
from lookalike.ml.embeddings import Embeddings, ImageArrays
from lookalike.ml.fashion_clip import DIMENSION
from lookalike.payments import IntentInfo, PaymentProviderError
from lookalike.payments.offline import OfflineGateway


class FakeEmbedder:
    """Deterministic stand-in for FashionCLIP: the vector is a pure function of the pixels, so
    identical images get identical embeddings and different images get unrelated ones."""

    dimension = DIMENSION
    logit_scale = 100.0
    version = "fake@test/pad"

    def __init__(self, version: str | None = None) -> None:
        if version is not None:
            self.version = version
        self.calls = 0
        self.images_embedded = 0
        self.texts_embedded = 0

    def is_loaded(self) -> bool:
        return True

    def embed_arrays(self, arrays: ImageArrays) -> Embeddings:
        self.calls += 1
        self.images_embedded += len(arrays)
        vectors = np.stack([self._vector(a) for a in arrays])
        return vectors.astype(np.float32)

    def embed_images(self, images: Sequence[Image.Image]) -> Embeddings:
        return self.embed_arrays(
            np.stack([np.asarray(i.convert("RGB").resize((224, 224))) for i in images])
        )

    def embed_texts(self, texts: Sequence[str]) -> Embeddings:
        self.texts_embedded += len(texts)
        return np.stack([self._vector(t.encode()) for t in texts]).astype(np.float32)

    async def aembed_images(self, images: Sequence[Image.Image]) -> Embeddings:
        return self.embed_images(images)

    async def aembed_texts(self, texts: Sequence[str]) -> Embeddings:
        return self.embed_texts(texts)

    @staticmethod
    def _vector(data: object) -> np.ndarray:
        raw = np.asarray(data).tobytes() if not isinstance(data, bytes) else data
        seed = int.from_bytes(hashlib.sha256(raw).digest()[:8], "big")
        vector = np.random.default_rng(seed).standard_normal(DIMENSION)
        return vector / np.linalg.norm(vector)


def write_jpeg(path: Path, seed: int, size: tuple[int, int] = (300, 400)) -> None:
    """A distinct, deterministic JPEG per seed (random noise blocks on a coloured field)."""
    rng = np.random.default_rng(seed)
    pixels = rng.integers(0, 256, size=(size[1], size[0], 3), dtype=np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixels).save(path, format="JPEG", quality=90)


class RecordingGateway(OfflineGateway):
    """The offline gateway plus a record of what the shop asked of it, and switches to make it
    fail the way a real provider does."""

    def __init__(self, webhook_secret: str = "") -> None:
        super().__init__(webhook_secret)
        self.created: list[dict[str, object]] = []
        self.cancelled: list[str] = []
        self.refunds: list[str] = []
        self.fail_create = False
        self.fail_cancel = False
        self.fail_refund = False
        # What cancel_intent reports: "succeeded" means the shopper paid in the meantime.
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
