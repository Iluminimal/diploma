"""Per-image work for ingestion: decode once, then produce thumbnails, a blur placeholder and
the CLIP input array. Runs in worker processes, so everything here must be picklable."""

import base64
import io
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from lookalike.ml.preprocess import InvalidImageError, ResizeMode, load_image, to_clip_array
from lookalike.storage import Storage

THUMBNAIL_SIZES = (400, 800)
WEBP_QUALITY = 80
BLUR_SIDE = 12
# Largest thumbnail dictates how much the JPEG decoder may downscale.
_DECODE_MIN_SIDE = max(THUMBNAIL_SIZES)


def image_key(source_id: int) -> str:
    """Storage key prefix for a product's images, sharded to keep directories small."""
    return f"products/{source_id // 1000:03d}/{source_id}"


def thumbnail_key(base_key: str, size: int) -> str:
    return f"{base_key}_{size}.webp"


@dataclass(frozen=True)
class ImageJob:
    source_id: int
    path: Path
    resize_mode: ResizeMode
    write_thumbnails: bool
    compute_array: bool


@dataclass(frozen=True)
class ImageResult:
    source_id: int
    error: str | None = None
    clip_array: NDArray[np.uint8] | None = None
    blur_data_url: str | None = None


def fit_longest_side(image: Image.Image, size: int) -> Image.Image:
    """Scale so the longest side is `size`, preserving aspect. Never upscales."""
    longest = max(image.size)
    if longest <= size:
        return image
    scale = size / longest
    new_size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def encode_webp(image: Image.Image, quality: int = WEBP_QUALITY) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=2)
    return buffer.getvalue()


def make_blur_data_url(image: Image.Image) -> str:
    tiny = fit_longest_side(image, BLUR_SIDE)
    encoded = base64.b64encode(encode_webp(tiny, quality=40)).decode("ascii")
    return f"data:image/webp;base64,{encoded}"


def process_image(job: ImageJob, storage: Storage) -> ImageResult:
    """Never raises for bad input: an unreadable image comes back as `error`."""
    try:
        image = load_image(job.path, min_side=_DECODE_MIN_SIDE)
    except InvalidImageError as exc:
        return ImageResult(job.source_id, error=str(exc))

    # Derive each size from the next larger one: cheaper than resizing the original twice.
    current = image
    base = image_key(job.source_id)
    for size in sorted(THUMBNAIL_SIZES, reverse=True):
        current = fit_longest_side(current, size)
        if job.write_thumbnails:
            storage.put(thumbnail_key(base, size), encode_webp(current))
    array = to_clip_array(image, job.resize_mode) if job.compute_array else None
    return ImageResult(job.source_id, clip_array=array, blur_data_url=make_blur_data_url(current))
