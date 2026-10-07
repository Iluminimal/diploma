"""Image decoding and CLIP input preparation.

This is the ONE place images are turned into model input, shared by ingestion and (later)
query-time search, so catalogue and query embeddings always see identical preprocessing.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import BinaryIO, Literal

import numpy as np
from numpy.typing import NDArray
from PIL import Image, ImageOps, UnidentifiedImageError

CLIP_SIZE = 224
# Reject anything bigger than this before decoding it fully (decompression-bomb guard).
MAX_PIXELS = 50_000_000
# White matches the catalogue's studio backgrounds, so padding and transparency blend in.
BACKGROUND = (255, 255, 255)

ResizeMode = Literal["crop", "pad"]
ImageSource = str | Path | bytes | BinaryIO


class InvalidImageError(ValueError):
    """The input is not a decodable, acceptably sized image."""


def load_image(source: ImageSource, *, min_side: int | None = None) -> Image.Image:
    """Decode to an upright RGB image with EXIF metadata dropped.

    `min_side` lets the JPEG decoder skip work: it decodes at 1/2, 1/4 or 1/8 scale as long as
    both dimensions stay >= `min_side`. Other formats ignore it.
    """
    file: str | Path | BinaryIO = io.BytesIO(source) if isinstance(source, bytes) else source
    try:
        image = Image.open(file)
        width, height = image.size
        if width <= 0 or height <= 0 or width * height > MAX_PIXELS:
            raise InvalidImageError(f"image dimensions {width}x{height} are not acceptable")
        if min_side is not None and image.format == "JPEG":
            image.draft("RGB", (min_side, min_side))
        image.load()
        return _to_rgb(ImageOps.exif_transpose(image))
    except InvalidImageError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        Image.DecompressionBombError,
    ) as exc:
        raise InvalidImageError(f"cannot decode image: {exc}") from exc


def _to_rgb(image: Image.Image) -> Image.Image:
    if image.mode == "RGB":
        return image
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, BACKGROUND)
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        return canvas
    return image.convert("RGB")


def to_clip_array(image: Image.Image, mode: ResizeMode = "pad") -> NDArray[np.uint8]:
    """Resize to a 224x224 uint8 HWC array.

    `crop` is CLIP's stock recipe (shortest side to 224, center crop), which cuts the top and
    bottom off portrait garments. `pad` keeps the whole garment and pads to a square.
    """
    width, height = image.size
    if mode == "crop":
        scale = CLIP_SIZE / min(width, height)
        resized = image.resize(
            (max(CLIP_SIZE, round(width * scale)), max(CLIP_SIZE, round(height * scale))),
            Image.Resampling.BICUBIC,
        )
        left = (resized.width - CLIP_SIZE) // 2
        top = (resized.height - CLIP_SIZE) // 2
        resized = resized.crop((left, top, left + CLIP_SIZE, top + CLIP_SIZE))
    else:
        scale = CLIP_SIZE / max(width, height)
        resized = image.resize(
            (max(1, round(width * scale)), max(1, round(height * scale))),
            Image.Resampling.BICUBIC,
        )
        canvas = Image.new("RGB", (CLIP_SIZE, CLIP_SIZE), BACKGROUND)
        canvas.paste(resized, ((CLIP_SIZE - resized.width) // 2, (CLIP_SIZE - resized.height) // 2))
        resized = canvas
    return np.asarray(resized, dtype=np.uint8)
