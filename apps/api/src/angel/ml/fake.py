"""FashionCLIP-ийн оронд тест, CI-ийн end-to-end орчинд ашиглах тогтмол (deterministic) embedder.

CI-д model татах, GPU байхгүй. `EMBEDDER=fake` гэж сонгоно; production үүнийг хүлээн авахгүй."""

import hashlib
from collections.abc import Sequence

import numpy as np
from PIL import Image

from angel.ml.embeddings import Embeddings, ImageArrays
from angel.ml.fashion_clip import DIMENSION
from angel.ml.localizer import Box, Region


class FakeEmbedder:
    """Vector нь зөвхөн pixel-ээс хамаарна: ижил зураг ижил embedding, өөр зураг хамааралгүй
    embedding авна. Хайлт "ажиллана" (бүтээгдэхүүний өөрийн зураг эхэнд гарна) ч хувцасны талаар
    юу ч мэдэхгүй."""

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


class FakeLocalizer:
    """Тогтмол хайрцгуудаар зургийг тайрна (detector-гүйгээр олон хэсэгтэй хайлтыг шалгахад).

    `labels` нь хайрцаг бүрийн анги; өгөөгүй бол `item-<n>`. Дуудлагын тоог `calls` хэмждэг."""

    def __init__(self, boxes: Sequence[Box], labels: Sequence[str] | None = None) -> None:
        if not boxes:
            raise ValueError("at least one box is required")
        self._boxes = list(boxes)
        self._labels = list(labels) if labels else [f"item-{n}" for n in range(len(boxes))]
        self.calls = 0

    async def alocate(self, image: Image.Image) -> list[Region]:
        self.calls += 1
        return [
            Region(
                image=image.crop(box.to_pixels(*image.size)),
                box=box,
                label=label,
                score=round(1.0 - 0.1 * n, 2),
            )
            for n, (box, label) in enumerate(zip(self._boxes, self._labels, strict=True))
        ]
