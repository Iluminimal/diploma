import io
from typing import Any

import pytest
from PIL import Image

from angel.ml.preprocess import InvalidImageError, load_image


def encode(image: Image.Image, fmt: str, **kwargs: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **kwargs)
    return buffer.getvalue()


def landscape_with_orientation(orientation: int) -> bytes:
    image = Image.new("RGB", (40, 20), "red")
    exif = Image.Exif()
    exif[0x0112] = orientation
    exif[0x010F] = "SomeMaker"
    return encode(image, "JPEG", exif=exif.tobytes())


@pytest.mark.parametrize(("orientation", "size"), [(1, (40, 20)), (6, (20, 40)), (8, (20, 40))])
def test_exif_orientation_is_applied_and_metadata_dropped(
    orientation: int, size: tuple[int, int]
) -> None:
    image = load_image(landscape_with_orientation(orientation))

    assert image.size == size
    assert image.mode == "RGB"
    assert len(image.getexif()) == 0
    assert "exif" not in image.info


def test_transparency_is_flattened_onto_white() -> None:
    transparent = encode(Image.new("RGBA", (10, 10), (255, 0, 0, 0)), "PNG")

    assert load_image(transparent).getpixel((5, 5)) == (255, 255, 255)


def test_formats_allow_list_checks_the_real_format() -> None:
    gif = encode(Image.new("RGB", (10, 10)), "GIF")
    png = encode(Image.new("RGB", (10, 10)), "PNG")

    with pytest.raises(InvalidImageError):
        load_image(gif, formats=("JPEG", "PNG", "WEBP"))
    assert load_image(png, formats=("JPEG", "PNG", "WEBP")).size == (10, 10)
    assert load_image(gif).size == (10, 10)  # ingestion-ий анхдагч нь зөөлөн хэвээр


def test_max_pixels_is_enforced_from_the_header() -> None:
    data = encode(Image.new("1", (20000, 20000)), "PNG")  # 400 MP

    with pytest.raises(InvalidImageError):
        load_image(data, max_pixels=1_000_000)
    with pytest.raises(InvalidImageError):
        load_image(data)  # анхдагч хязгаар (50 MP) үүнийг мөн барина


def test_animated_images_decode_only_their_first_frame() -> None:
    frames = [Image.new("RGB", (16, 16), colour) for colour in ("red", "green", "blue")]
    buffer = io.BytesIO()
    frames[0].save(buffer, format="WEBP", save_all=True, append_images=frames[1:], duration=50)

    image = load_image(buffer.getvalue(), formats=("WEBP",))

    assert image.size == (16, 16)
    assert getattr(image, "n_frames", 1) == 1


@pytest.mark.parametrize("data", [b"", b"not an image", b"\xff\xd8\xff" + b"\0" * 10])
def test_garbage_raises_invalid_image(data: bytes) -> None:
    with pytest.raises(InvalidImageError):
        load_image(data)
