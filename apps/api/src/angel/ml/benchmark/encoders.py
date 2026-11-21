"""Зургийн embedding гаргадаг загваруудын нийтлэг интерфейс, харьцуулалтад зориулсан.

Production-ийн `EmbeddingService` нь текст шаарддаг (ResNet-д байхгүй) ба 224x224/512 хэмжээсийг
шууд тооцдог тул харьцуулалт өөр жижиг интерфейс ашиглана. Бүх загвар ЯГ ИЖИЛ оролт авна:
`to_clip_array`-ийн гаргасан 224x224 uint8 массив (ingestion-ийн бодсон тэр). Ингэснээр зөрүү нь
загвараас гарна, preprocessing-ээс биш. Загвар бүр зөвхөн өөрийн mean/std-ээр normalize хийнэ.
"""

from collections.abc import Callable
from typing import Any, Protocol

import numpy as np
import torch

from angel.ml.embeddings import Embeddings, ImageArrays
from angel.ml.fashion_clip import MODEL_REVISION as FASHION_CLIP_REVISION
from angel.ml.fashion_clip import FashionClipEmbedder
from angel.ml.gpu import GPU_LOCK
from angel.ml.preprocess import CLIP_SIZE

MARQO_REPO = "Marqo/marqo-fashionSigLIP"
# Weights-ийг тогтсон commit-оос л авна (өөр машин, өөр өдөр ижил embedding гаргахын тулд).
MARQO_REVISION = "c56244cc94f92419e8369fa71efdaf403b124ce8"
_IMAGENET_MEAN = (0.485, 0.456, 0.406)
_IMAGENET_STD = (0.229, 0.224, 0.225)


class ImageEncoder(Protocol):
    name: str
    version: str
    dimension: int

    def load(self) -> None: ...

    def encode(self, arrays: ImageArrays) -> Embeddings:
        """(n, 224, 224, 3) uint8 -> (n, dimension) float32, мөр бүр L2-normalize хийгдсэн."""
        ...

    def parameters(self) -> int:
        """Зургийн хэсгийн (vision tower) параметрийн тоо."""
        ...

    def close(self) -> None: ...


def _normalize(features: torch.Tensor) -> Embeddings:
    features = features.float()
    features = features / features.norm(dim=-1, keepdim=True).clamp_min(1e-12)
    return features.cpu().numpy().astype(np.float32, copy=False)


def _to_pixels(
    arrays: ImageArrays, device: torch.device, mean: tuple[float, ...], std: tuple[float, ...]
) -> torch.Tensor:
    if arrays.ndim != 4 or arrays.shape[1:] != (CLIP_SIZE, CLIP_SIZE, 3):
        raise ValueError(f"expected (n, {CLIP_SIZE}, {CLIP_SIZE}, 3) uint8, got {arrays.shape}")
    pixels = torch.from_numpy(np.ascontiguousarray(arrays)).to(device)
    pixels = pixels.permute(0, 3, 1, 2).float().div_(255.0)
    mean_t = torch.tensor(mean, device=device).view(1, 3, 1, 1)
    std_t = torch.tensor(std, device=device).view(1, 3, 1, 1)
    return (pixels - mean_t) / std_t


class FashionClipEncoder:
    """Production-д ажиллаж буй FashionCLIP (ViT-B/32): тэр л класс, өөрчлөлтгүй."""

    name = "fashion-clip"
    dimension = 512

    def __init__(self, device: torch.device) -> None:
        self._embedder = FashionClipEmbedder(device=device)
        self.version = f"fashion-clip@{FASHION_CLIP_REVISION[:8]}"

    def load(self) -> None:
        self._embedder.load()

    def encode(self, arrays: ImageArrays) -> Embeddings:
        return self._embedder.embed_arrays(arrays)

    def parameters(self) -> int:
        model = self._embedder._require_model()
        return sum(p.numel() for p in model.vision_model.parameters())

    def close(self) -> None:
        self._embedder.close()


class MarqoSigLipEncoder:
    """Marqo-FashionSigLIP: fashion-д fine-tune хийсэн SigLIP ViT-B/16 (open_clip)."""

    name = "marqo-fashion-siglip"

    def __init__(self, device: torch.device) -> None:
        self._device = device
        self.version = f"marqo-fashion-siglip@{MARQO_REVISION[:8]}"
        self.dimension = 0  # load() дээр загвараас уншина
        self._model: Any = None
        self._mean: tuple[float, ...] = (0.5, 0.5, 0.5)
        self._std: tuple[float, ...] = (0.5, 0.5, 0.5)

    def load(self) -> None:
        import open_clip
        from huggingface_hub import snapshot_download

        path = snapshot_download(
            MARQO_REPO,
            revision=MARQO_REVISION,
            allow_patterns=["open_clip_config.json", "open_clip_model.safetensors"],
        )
        model, _, preprocess = open_clip.create_model_and_transforms(f"local-dir:{path}")
        model = model.to(self._device).eval()
        config = getattr(model.visual, "preprocess_cfg", {})
        self._mean = tuple(config.get("mean", self._mean))
        self._std = tuple(config.get("std", self._std))
        size = config.get("size", CLIP_SIZE)
        side = tuple(size) if isinstance(size, (tuple, list)) else (size, size)
        if side != (CLIP_SIZE, CLIP_SIZE):
            raise RuntimeError(f"{MARQO_REPO} expects {size} input, benchmark feeds {CLIP_SIZE}")
        self._model = model
        del preprocess  # оролтыг бид өөрсдөө бэлддэг (бүх загварт ижил)
        with torch.inference_mode():
            probe = _to_pixels(
                np.zeros((1, CLIP_SIZE, CLIP_SIZE, 3), np.uint8),
                self._device,
                self._mean,
                self._std,
            )
            self.dimension = int(model.encode_image(probe).shape[-1])

    def encode(self, arrays: ImageArrays) -> Embeddings:
        model = self._require()
        with GPU_LOCK, torch.inference_mode():
            pixels = _to_pixels(arrays, self._device, self._mean, self._std)
            return _normalize(model.encode_image(pixels))

    def parameters(self) -> int:
        return int(sum(p.numel() for p in self._require().visual.parameters()))

    def close(self) -> None:
        self._model = None

    def _require(self) -> Any:
        if self._model is None:
            raise RuntimeError("model not loaded: call load() first")
        return self._model


class ResNet50Encoder:
    """ImageNet-ээр сургасан ResNet-50 (fashion-ийн талаар юу ч мэдэхгүй CNN baseline).

    Embedding нь сүүлийн global average pooling-ийн гаралт (2048)."""

    name = "resnet50-imagenet"
    dimension = 2048

    def __init__(self, device: torch.device) -> None:
        self._device = device
        self.version = "resnet50-imagenet1k-v2"
        self._model: Any = None

    def load(self) -> None:
        from torchvision.models import ResNet50_Weights, resnet50

        model = resnet50(weights=ResNet50_Weights.IMAGENET1K_V2)
        model.fc = torch.nn.Identity()
        self._model = model.to(self._device).eval()

    def encode(self, arrays: ImageArrays) -> Embeddings:
        model = self._require()
        with GPU_LOCK, torch.inference_mode():
            pixels = _to_pixels(arrays, self._device, _IMAGENET_MEAN, _IMAGENET_STD)
            return _normalize(model(pixels))

    def parameters(self) -> int:
        return int(sum(p.numel() for p in self._require().parameters()))

    def close(self) -> None:
        self._model = None

    def _require(self) -> Any:
        if self._model is None:
            raise RuntimeError("model not loaded: call load() first")
        return self._model


ENCODERS: dict[str, Callable[[torch.device], ImageEncoder]] = {
    "fashion-clip": FashionClipEncoder,
    "marqo-fashion-siglip": MarqoSigLipEncoder,
    "resnet50-imagenet": ResNet50Encoder,
}


def build_encoder(name: str, device: torch.device) -> ImageEncoder:
    try:
        return ENCODERS[name](device)
    except KeyError:
        raise ValueError(f"unknown encoder {name!r}; choose from {sorted(ENCODERS)}") from None
