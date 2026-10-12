"""A deterministic stand-in for FashionCLIP, for tests and for the end-to-end stack in CI, where
there is no model download and no GPU. `EMBEDDER=fake` selects it; production refuses it."""

import hashlib
from collections.abc import Sequence

import numpy as np
from PIL import Image

from angel.ml.embeddings import Embeddings, ImageArrays
from angel.ml.fashion_clip import DIMENSION


class FakeEmbedder:
    """The vector is a pure function of the pixels, so identical images get identical embeddings
    and different images get unrelated ones. Search "works" (a product's own photo finds it
    first) but it knows nothing about clothes."""

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
