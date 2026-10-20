"""Хувцасны байршил тогтоох, zero-shot аргаар category таамаглах.

Хоёулаа жижиг interface-ийн ард байгаа: дараа нь detector (жишээ нь YOLO) хэд хэдэн хувцасны
хэсэг буцааж, тус бүрийг тусад нь embed, classify хийж болно. Одоогоор "хэсэг" нь бүтэн зураг.
"""

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from angel.ml.embeddings import EmbeddingService

PROMPT_TEMPLATE = "a photo of {label}"


@dataclass(frozen=True)
class CategoryLabel:
    """Таамаглаж болох category. Бүтээгдэхүүнийг `article_type`-оор шүүнэ."""

    article_type: str
    path: str  # slug-ийн бүтэн зам, жишээ нь "apparel/topwear/shirts"
    name: str  # prompt-д орох хүнд ойлгомжтой нэр, жишээ нь "Shirts"


@dataclass(frozen=True)
class CategoryPrediction:
    label: CategoryLabel
    score: float  # бүх label дээрх softmax магадлал, [0, 1]


class GarmentLocalizer(Protocol):
    def locate(self, image: Image.Image) -> list[Image.Image]:
        """Хайх хувцасны хэсгүүд. Хэзээ ч хоосон биш."""
        ...


class WholeImageLocalizer:
    """Detection хийхгүй: бүтэн зургийг хувцас гэж үзнэ."""

    def locate(self, image: Image.Image) -> list[Image.Image]:
        return [image]


class CategoryClassifier(Protocol):
    def predict(self, embedding: NDArray[np.float32], top_k: int) -> list[CategoryPrediction]: ...


class LazyCategoryClassifier:
    """Жинхэнэ classifier-ийг анх ашиглах үед үүсгэнэ (алдаа гарвал дахин оролдоно).

    Label-үүд database-аас ирдэг, startup үед database түр бэлэн биш байж болно. Гэхдээ API
    ердийнхөөрөө асаж, database бэлэн болмогц ажиллах ёстой.
    """

    def __init__(self, factory: Callable[[], Awaitable[CategoryClassifier]]) -> None:
        self._factory = factory
        self._lock = asyncio.Lock()
        self._classifier: CategoryClassifier | None = None

    async def get(self) -> CategoryClassifier:
        if self._classifier is None:
            async with self._lock:
                if self._classifier is None:
                    self._classifier = await self._factory()
        return self._classifier


class ZeroShotCategoryClassifier:
    """Зургийн embedding-ийг category нэрсийн text embedding-тэй харьцуулна.

    Label embedding-ийг нэг л удаа бодсон тул таамаглал нь хайлтад аль хэдийн хэрэгтэй зургийн
    embedding дээр нэг жижиг матрицын үржвэр нэмэхэд л хүрнэ.
    """

    def __init__(
        self,
        labels: Sequence[CategoryLabel],
        label_embeddings: NDArray[np.float32],
        logit_scale: float,
    ) -> None:
        if len(labels) != len(label_embeddings):
            raise ValueError("one embedding per label is required")
        self._labels = list(labels)
        self._embeddings = label_embeddings
        self._logit_scale = logit_scale

    @classmethod
    async def build(
        cls, embedder: EmbeddingService, labels: Sequence[CategoryLabel]
    ) -> "ZeroShotCategoryClassifier":
        prompts = [PROMPT_TEMPLATE.format(label=label.name.lower()) for label in labels]
        vectors = (
            await embedder.aembed_texts(prompts)
            if prompts
            else np.zeros((0, embedder.dimension), dtype=np.float32)
        )
        return cls(labels, vectors, embedder.logit_scale)

    def predict(self, embedding: NDArray[np.float32], top_k: int) -> list[CategoryPrediction]:
        if not self._labels:
            return []
        logits = self._logit_scale * (self._embeddings @ embedding)
        logits -= logits.max()  # тоон тогтвортой байлгах
        probabilities = np.exp(logits)
        probabilities /= probabilities.sum()
        best = np.argsort(-probabilities)[:top_k]
        return [CategoryPrediction(self._labels[i], float(probabilities[i])) for i in best]
