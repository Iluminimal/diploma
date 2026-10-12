import asyncio
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from typing import Literal, TypeVar

import numpy as np
import torch
from PIL import Image
from transformers import AutoTokenizer, CLIPModel, PreTrainedTokenizerBase

from angel.ml.embeddings import Embeddings, ImageArrays
from angel.ml.preprocess import CLIP_SIZE, ResizeMode, to_clip_array

MODEL_ID = "patrickjohncyh/fashion-clip"
# Pinned so every machine (and Colab) produces identical embeddings.
MODEL_REVISION = "7e3ba62ce16b379a1ab479346b66f192e76f51b7"
DIMENSION = 512
# CLIP's training-time channel statistics (see the model's preprocessor_config.json).
_MEAN = (0.48145466, 0.4578275, 0.40821073)
_STD = (0.26862954, 0.26130258, 0.27577711)

DevicePreference = Literal["auto", "mps", "cpu", "cuda"]
_T = TypeVar("_T")


def select_device(preference: DevicePreference = "auto") -> torch.device:
    """`auto` prefers CUDA, then Apple MPS, then CPU."""
    if preference == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    if preference == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS requested but not available")
    if preference == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but not available")
    return torch.device(preference)


def embedding_version(resize_mode: ResizeMode) -> str:
    return f"fashion-clip@{MODEL_REVISION[:8]}/{resize_mode}"


class FashionClipEmbedder:
    """FashionCLIP (ViT-B/32) image and text embeddings, L2-normalized.

    MPS must not be driven from several threads at once, so all inference is serialized on one
    dedicated worker thread. The async methods hand work to it, keeping the event loop free.
    """

    dimension = DIMENSION
    logit_scale = 100.0  # replaced by the model's learned value in load()

    def __init__(
        self,
        *,
        device: torch.device | None = None,
        fp16: bool = False,
        resize_mode: ResizeMode = "pad",
    ) -> None:
        self.device = device or select_device()
        self.fp16 = fp16
        self.resize_mode: ResizeMode = resize_mode
        self.version = embedding_version(resize_mode)
        self._dtype = torch.float16 if fp16 else torch.float32
        self._model: CLIPModel | None = None
        self._tokenizer: PreTrainedTokenizerBase | None = None
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="embedder")

    def load(self) -> None:
        model = CLIPModel.from_pretrained(
            MODEL_ID, revision=MODEL_REVISION, use_safetensors=True, dtype=self._dtype
        )
        torch.nn.Module.to(model, self.device)
        model.eval()  # type: ignore[no-untyped-call]
        self._tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
        self._mean = torch.tensor(_MEAN, device=self.device, dtype=self._dtype).view(1, 3, 1, 1)
        self._std = torch.tensor(_STD, device=self.device, dtype=self._dtype).view(1, 3, 1, 1)
        self._model = model
        self.logit_scale = float(model.logit_scale.detach().float().exp().item())

    def is_loaded(self) -> bool:
        return self._model is not None

    def close(self) -> None:
        self._executor.shutdown(wait=True)

    def embed_arrays(self, arrays: ImageArrays) -> Embeddings:
        model = self._require_model()
        if arrays.ndim != 4 or arrays.shape[1:] != (CLIP_SIZE, CLIP_SIZE, 3):
            raise ValueError(f"expected (n, {CLIP_SIZE}, {CLIP_SIZE}, 3) uint8, got {arrays.shape}")
        with torch.inference_mode():
            pixels = torch.from_numpy(np.ascontiguousarray(arrays)).to(self.device)
            pixels = pixels.permute(0, 3, 1, 2).to(self._dtype).div_(255.0)
            pixels = (pixels - self._mean) / self._std
            features = model.get_image_features(pixel_values=pixels).pooler_output
            return self._normalize(features)

    def embed_images(self, images: Sequence[Image.Image]) -> Embeddings:
        if not images:
            return np.zeros((0, DIMENSION), dtype=np.float32)
        arrays = np.stack([to_clip_array(image, self.resize_mode) for image in images])
        return self.embed_arrays(arrays)

    def embed_texts(self, texts: Sequence[str]) -> Embeddings:
        model = self._require_model()
        assert self._tokenizer is not None
        if not texts:
            return np.zeros((0, DIMENSION), dtype=np.float32)
        tokens = self._tokenizer(
            list(texts), padding=True, truncation=True, max_length=77, return_tensors="pt"
        ).to(self.device)
        with torch.inference_mode():
            features = model.get_text_features(**tokens).pooler_output
            return self._normalize(features)

    async def aembed_images(self, images: Sequence[Image.Image]) -> Embeddings:
        return await self._run(self.embed_images, images)

    async def aembed_texts(self, texts: Sequence[str]) -> Embeddings:
        return await self._run(self.embed_texts, texts)

    async def _run(self, fn: Callable[[Sequence[_T]], Embeddings], arg: Sequence[_T]) -> Embeddings:
        return await asyncio.get_running_loop().run_in_executor(self._executor, fn, arg)

    def _require_model(self) -> CLIPModel:
        if self._model is None:
            raise RuntimeError("model not loaded: call load() first")
        return self._model

    @staticmethod
    def _normalize(features: torch.Tensor) -> Embeddings:
        # Normalize in fp32 even when the forward pass ran in fp16.
        features = features.float()
        features = features / features.norm(dim=-1, keepdim=True).clamp_min(1e-12)
        return features.cpu().numpy().astype(np.float32, copy=False)
