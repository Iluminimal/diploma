"""YOLO detector-оор зураг дээрх хувцас, гутал, цүнх, аксессуарыг тусад нь олох.

Weights: `NovaAstro/YOLOv8m_fashion` (Fashionpedia дээр fine-tune хийсэн YOLOv8m, Apache-2.0).
46 ангийн дотор хувцасны хэсгүүд (sleeve, pocket, collar ...) байдаг, тэдгээр нь хайх зүйл биш
тул `GARMENT_CLASSES`-ээр шүүнэ. Ultralytics нь AGPL-3.0 лицензтэй (README-д тэмдэглэсэн).

Загвар ачаалах, inference нь embedder-тэй адил тусгай нэг worker thread дээр ажиллана, event
loop дээр хэзээ ч биш.
"""

import asyncio
import contextlib
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import torch
from PIL import Image

from angel.ml.gpu import GPU_LOCK
from angel.ml.localizer import WHOLE_IMAGE, Box, Region

MODEL_REPO = "NovaAstro/YOLOv8m_fashion"
MODEL_FILE = "model_with_updated_labels.pt"
# Weights нь pickle тул тогтсон commit-ээс л татна (HF дээр сүүлд солигдсон файл ачаалагдахгүй).
MODEL_REVISION = "f3f62487dc09b0e35716e99a8211300294deb07b"

# Хайх боломжтой анги (хувцас ба аксессуар). Хэсгүүд (sleeve, pocket, neckline, zipper ...)
# болон hood, collar, lapel зэргийг оруулаагүй.
GARMENT_CLASSES = frozenset(
    {
        "shirt, blouse",
        "top, t-shirt, sweatshirt",
        "sweater",
        "cardigan",
        "jacket",
        "vest",
        "pants",
        "shorts",
        "skirt",
        "coat",
        "dress",
        "jumpsuit",
        "cape",
        "glasses",
        "hat",
        "headband, head covering, hair accessory",
        "tie",
        "glove",
        "watch",
        "belt",
        "leg warmer",
        "tights, stockings",
        "sock",
        "shoe",
        "bag, wallet",
        "scarf",
        "umbrella",
    }
)


@dataclass(frozen=True)
class Detection:
    box: Box
    label: str
    score: float


def pad_box(box: Box, padding: float) -> Box:
    """Хайрцгийн өргөн, өндрийн `padding` хувиар бүх талаас томруулж, зургийн хүрээнд тайрна."""
    dx = (box.x1 - box.x0) * padding
    dy = (box.y1 - box.y0) * padding
    return Box(
        max(0.0, box.x0 - dx), max(0.0, box.y0 - dy), min(1.0, box.x1 + dx), min(1.0, box.y1 + dy)
    )


def rank_regions(
    image: Image.Image,
    detections: Sequence[Detection],
    *,
    max_regions: int,
    min_area: float,
    padding: float,
) -> list[Region]:
    """Detection-ийг хайх хэсэг болгоно: хэт жижгийг хаяж, хамгийн тод нь эхэнд эрэмбэлнэ.

    Эрэмбийн оноо = `score * sqrt(талбай)`: итгэлтэй ба том зүйл (бүтэн хувцас) нь итгэлтэй
    боловч жижиг зүйлээс (цаг, сая) өмнө гарна. Юу ч олдоогүй бол бүтэн зургийг буцаана.
    """
    kept = [d for d in detections if d.box.area >= min_area]
    kept.sort(key=lambda d: d.score * d.box.area**0.5, reverse=True)
    regions: list[Region] = []
    for detection in kept[:max_regions]:
        box = pad_box(detection.box, padding)
        crop = image.crop(box.to_pixels(*image.size))
        regions.append(Region(image=crop, box=box, label=detection.label, score=detection.score))
    return regions or [Region(image=image, box=WHOLE_IMAGE)]


class YoloGarmentLocalizer:
    def __init__(
        self,
        *,
        device: torch.device,
        confidence: float = 0.25,
        max_regions: int = 5,
        min_area: float = 0.01,
        padding: float = 0.05,
        image_size: int = 640,
        repo: str = MODEL_REPO,
        filename: str = MODEL_FILE,
        revision: str = MODEL_REVISION,
    ) -> None:
        self.device = device
        self._confidence = confidence
        self._max_regions = max_regions
        self._min_area = min_area
        self._padding = padding
        self._image_size = image_size
        self._source = (repo, filename, revision)
        self._model: Any = None
        self._classes: list[int] = []
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="localizer")

    def load(self) -> None:
        from huggingface_hub import hf_hub_download
        from ultralytics import YOLO, settings  # type: ignore[attr-defined]

        # Ultralytics-ийн нэргүй статистик илгээлтийг унтраана (хэрэглэгчийн зураг хэзээ ч явахгүй,
        # гэхдээ сүлжээнд шаардлагагүй дуудлага хийх хэрэггүй).
        with contextlib.suppress(Exception):
            settings.update({"sync": False})  # type: ignore[no-untyped-call]
        repo, filename, revision = self._source
        path = hf_hub_download(repo, filename, revision=revision)
        model = YOLO(path)
        self._classes = sorted(
            index for index, name in model.names.items() if index >= 0 and name in GARMENT_CLASSES
        )
        if not self._classes:
            raise RuntimeError(f"{repo}: no garment classes among {sorted(model.names.values())}")
        self._model = model

    def is_loaded(self) -> bool:
        return self._model is not None

    def close(self) -> None:
        self._executor.shutdown(wait=True)

    def detect(self, image: Image.Image) -> list[Detection]:
        if self._model is None:
            raise RuntimeError("detector not loaded: call load() first")
        with GPU_LOCK:
            result = self._model.predict(
                image,
                device=str(self.device),
                imgsz=self._image_size,
                conf=self._confidence,
                classes=self._classes,
                agnostic_nms=True,  # нэг зүйлийг хоёр өөр ангиар давхар хайрцаглахаас сэргийлнэ
                verbose=False,
            )[0]
        boxes = result.boxes
        names = result.names
        return [
            Detection(Box(x0, y0, x1, y1), names[int(cls)], float(conf))
            for (x0, y0, x1, y1), cls, conf in zip(
                boxes.xyxyn.cpu().tolist(),
                boxes.cls.cpu().tolist(),
                boxes.conf.cpu().tolist(),
                strict=True,
            )
        ]

    def locate(self, image: Image.Image) -> list[Region]:
        return rank_regions(
            image,
            self.detect(image),
            max_regions=self._max_regions,
            min_area=self._min_area,
            padding=self._padding,
        )

    async def alocate(self, image: Image.Image) -> list[Region]:
        return await asyncio.get_running_loop().run_in_executor(self._executor, self.locate, image)
