from collections.abc import Sequence
from typing import Protocol

import numpy as np
from numpy.typing import NDArray
from PIL import Image

Embeddings = NDArray[np.float32]
ImageArrays = NDArray[np.uint8]


class EmbeddingService(Protocol):
    """Апп ба model-ийн хоорондох зааг, ингэснээр model-ийг солих боломжтой.

    Метод бүр урт нь `dimension`, L2-normalize хийсэн float32 мөрүүд буцаана. Sync метод
    блоклодог тул script-д; async метод inference-ийг event loop-оос гадуур ажиллуулна.
    """

    dimension: int
    # Vector-уудыг харьцуулах боломжтой болгодог бүхнийг (model revision + preprocessing)
    # тодорхойлно. Бүтээгдэхүүн бүртэй хамт хадгалдаг тул model солигдсоны дараа хуучирсан
    # embedding-ийг илрүүлнэ.
    version: str
    # CLIP-ийн сурсан temperature: softmax(logit_scale * cosine) нь ижил төстэй байдлыг
    # магадлал болгоно (zero-shot classification).
    logit_scale: float

    def is_loaded(self) -> bool: ...

    def embed_arrays(self, arrays: ImageArrays) -> Embeddings:
        """Preprocess хийж дууссан зургуудыг embed хийнэ: (n, 224, 224, 3) хэлбэртэй uint8 array."""
        ...

    def embed_images(self, images: Sequence[Image.Image]) -> Embeddings: ...

    def embed_texts(self, texts: Sequence[str]) -> Embeddings: ...

    async def aembed_images(self, images: Sequence[Image.Image]) -> Embeddings: ...

    async def aembed_texts(self, texts: Sequence[str]) -> Embeddings: ...
