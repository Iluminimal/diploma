from collections.abc import Sequence
from typing import Protocol

import numpy as np
from numpy.typing import NDArray
from PIL import Image

Embeddings = NDArray[np.float32]
ImageArrays = NDArray[np.uint8]


class EmbeddingService(Protocol):
    """Seam between the application and the model, so the model can be swapped.

    Every method returns L2-normalized float32 rows of length `dimension`. The sync methods
    block and are for scripts; the async ones run inference off the event loop.
    """

    dimension: int
    # Identifies everything that makes vectors comparable (model revision + preprocessing).
    # Stored with each product so stale embeddings can be detected after a model change.
    version: str
    # CLIP's learned temperature: softmax(logit_scale * cosine) turns similarities into
    # probabilities (zero-shot classification).
    logit_scale: float

    def is_loaded(self) -> bool: ...

    def embed_arrays(self, arrays: ImageArrays) -> Embeddings:
        """Embed already-preprocessed images: uint8 array of shape (n, 224, 224, 3)."""
        ...

    def embed_images(self, images: Sequence[Image.Image]) -> Embeddings: ...

    def embed_texts(self, texts: Sequence[str]) -> Embeddings: ...

    async def aembed_images(self, images: Sequence[Image.Image]) -> Embeddings: ...

    async def aembed_texts(self, texts: Sequence[str]) -> Embeddings: ...
