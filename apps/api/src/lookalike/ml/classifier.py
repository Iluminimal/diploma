"""Garment localization and zero-shot category prediction.

Both sit behind small interfaces: a detector (e.g. YOLO) can later return several garment
regions, each of which is embedded and classified independently. For now the "region" is the
whole image.
"""

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from lookalike.ml.embeddings import EmbeddingService

PROMPT_TEMPLATE = "a photo of {label}"


@dataclass(frozen=True)
class CategoryLabel:
    """A predictable category. `article_type` is what products are filtered by."""

    article_type: str
    path: str  # full slug path, e.g. "apparel/topwear/shirts"
    name: str  # human-readable text used in the prompt, e.g. "Shirts"


@dataclass(frozen=True)
class CategoryPrediction:
    label: CategoryLabel
    score: float  # softmax probability over all labels, in [0, 1]


class GarmentLocalizer(Protocol):
    def locate(self, image: Image.Image) -> list[Image.Image]:
        """Garment regions to search for. Never empty."""
        ...


class WholeImageLocalizer:
    """No detection: the whole picture is the garment."""

    def locate(self, image: Image.Image) -> list[Image.Image]:
        return [image]


class CategoryClassifier(Protocol):
    def predict(self, embedding: NDArray[np.float32], top_k: int) -> list[CategoryPrediction]: ...


class LazyCategoryClassifier:
    """Builds the real classifier on first use (and retries after a failure).

    Its labels come from the database, which may be briefly unavailable at startup; the API
    should still boot and become ready as soon as the database is.
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
    """Compares an image embedding with text embeddings of the category names.

    Label embeddings are computed once, so predicting costs one small matrix product on top of
    the image embedding the search already needs.
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
        logits -= logits.max()  # numerical stability
        probabilities = np.exp(logits)
        probabilities /= probabilities.sum()
        best = np.argsort(-probabilities)[:top_k]
        return [CategoryPrediction(self._labels[i], float(probabilities[i])) for i in best]
