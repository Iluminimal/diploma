import io
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from PIL import Image

from angel.ingestion.images import (
    ImageJob,
    image_key,
    make_blur_data_url,
    process_image,
    thumbnail_key,
)
from angel.ml.preprocess import CLIP_SIZE, InvalidImageError, load_image, to_clip_array
from angel.storage import LocalStorage


def _save(path: Path, image: Image.Image, **kwargs: Any) -> Path:
    image.save(path, **kwargs)
    return path


def _open_stored(storage: LocalStorage, key: str) -> Image.Image:
    return Image.open(io.BytesIO(storage.root.joinpath(key).read_bytes()))


def test_keys_are_sharded_by_thousands() -> None:
    assert image_key(15970) == "products/015/15970"
    assert image_key(5) == "products/000/5"
    assert thumbnail_key(image_key(15970), 400) == "products/015/15970_400.webp"


def test_process_image_writes_both_webp_sizes_preserving_aspect(tmp_path: Path) -> None:
    source = _save(tmp_path / "p.jpg", Image.new("RGB", (1800, 2400), (200, 30, 30)), format="JPEG")
    storage = LocalStorage(tmp_path / "media", "/media")
    result = process_image(ImageJob(15970, source, "pad", True, True), storage)

    assert result.error is None
    for size, expected in ((400, (300, 400)), (800, (600, 800))):
        image = _open_stored(storage, thumbnail_key(image_key(15970), size))
        assert image.format == "WEBP"
        assert image.size == expected
    assert result.clip_array is not None
    assert result.clip_array.shape == (CLIP_SIZE, CLIP_SIZE, 3)
    assert result.blur_data_url is not None
    assert result.blur_data_url.startswith("data:image/webp;base64,")
    assert len(result.blur_data_url) < 600


def test_thumbnails_never_upscale_small_images(tmp_path: Path) -> None:
    source = _save(tmp_path / "small.png", Image.new("RGB", (120, 90)), format="PNG")
    storage = LocalStorage(tmp_path / "media", "/media")
    process_image(ImageJob(1, source, "pad", True, False), storage)
    for size in (400, 800):
        assert _open_stored(storage, thumbnail_key(image_key(1), size)).size == (120, 90)


def test_flags_control_outputs(tmp_path: Path) -> None:
    source = _save(tmp_path / "p.jpg", Image.new("RGB", (500, 500)), format="JPEG")
    storage = LocalStorage(tmp_path / "media", "/media")
    result = process_image(
        ImageJob(2, source, "pad", write_thumbnails=False, compute_array=False), storage
    )
    assert result.clip_array is None
    assert result.blur_data_url is not None
    assert not storage.exists(thumbnail_key(image_key(2), 400))


def test_corrupt_file_is_reported_not_raised(tmp_path: Path) -> None:
    broken = tmp_path / "broken.jpg"
    broken.write_bytes(b"\xff\xd8\xff garbage")
    result = process_image(
        ImageJob(3, broken, "pad", True, True), LocalStorage(tmp_path / "m", "/m")
    )
    assert result.error is not None
    assert result.clip_array is None


def test_missing_file_is_reported(tmp_path: Path) -> None:
    result = process_image(
        ImageJob(4, tmp_path / "nope.jpg", "pad", True, True), LocalStorage(tmp_path / "m", "/m")
    )
    assert result.error is not None


@pytest.mark.parametrize("mode", ["RGBA", "LA", "P", "CMYK", "L"])
def test_unusual_color_modes_decode_to_rgb(tmp_path: Path, mode: str) -> None:
    image = Image.new(mode, (64, 48))
    fmt = "TIFF" if mode == "CMYK" else "PNG"
    path = _save(tmp_path / f"x.{fmt.lower()}", image, format=fmt)
    assert load_image(path).mode == "RGB"


def test_transparency_is_composited_on_white() -> None:
    buffer = io.BytesIO()
    Image.new("RGBA", (10, 10), (255, 0, 0, 0)).save(buffer, format="PNG")
    assert load_image(buffer.getvalue()).getpixel((5, 5)) == (255, 255, 255)


def test_exif_orientation_is_applied_and_metadata_dropped(tmp_path: Path) -> None:
    image = Image.new("RGB", (40, 20), (10, 20, 30))
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees clockwise to display
    path = _save(tmp_path / "rot.jpg", image, format="JPEG", exif=exif)
    loaded = load_image(path)
    assert loaded.size == (20, 40)
    assert not loaded.getexif()


def test_decompression_bomb_is_rejected_before_decoding() -> None:
    # 60M pixels (over our 50M limit, under Pillow's own warning), but the file is tiny.
    buffer = io.BytesIO()
    Image.new("1", (7_746, 7_746)).save(buffer, format="PNG")
    with pytest.raises(InvalidImageError, match="not acceptable"):
        load_image(buffer.getvalue())


def test_non_image_bytes_are_rejected() -> None:
    with pytest.raises(InvalidImageError):
        load_image(b"definitely not an image")


def test_jpeg_draft_decoding_keeps_the_minimum_side(tmp_path: Path) -> None:
    path = _save(tmp_path / "big.jpg", Image.new("RGB", (1800, 2400)), format="JPEG")
    assert load_image(path, min_side=800).size == (900, 1200)
    assert load_image(path).size == (1800, 2400)


def test_clip_array_pad_keeps_whole_image_and_crop_cuts_it() -> None:
    # Portrait image: red top third, green middle, blue bottom third.
    pixels = np.zeros((300, 100, 3), dtype=np.uint8)
    pixels[:100, :, 0] = 255
    pixels[100:200, :, 1] = 255
    pixels[200:, :, 2] = 255
    image = Image.fromarray(pixels)

    padded = to_clip_array(image, "pad")
    cropped = to_clip_array(image, "crop")

    assert padded.shape == cropped.shape == (CLIP_SIZE, CLIP_SIZE, 3)
    assert padded[5, CLIP_SIZE // 2, 0] > 200  # top of the padded image is still red
    assert padded[-5, CLIP_SIZE // 2, 2] > 200  # bottom is still blue
    assert tuple(padded[100, 2]) == (255, 255, 255)  # side padding is white
    assert cropped[5, CLIP_SIZE // 2, 1] > 200  # the crop only sees the green middle
    assert cropped[5, CLIP_SIZE // 2, 0] < 50


def test_blur_placeholder_is_tiny() -> None:
    url = make_blur_data_url(Image.new("RGB", (300, 400), (120, 120, 200)))
    assert len(url) < 400
