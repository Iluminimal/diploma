"""Upload edge cases for the image endpoints (`/search/image` and `/search/hybrid`)."""

import io
import tempfile
import time
from collections.abc import AsyncIterator
from typing import Any

import pytest
from PIL import Image

from tests.catalogue import make_jpeg
from tests.conftest import ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

IMAGE = "/api/v1/search/image"
HYBRID = "/api/v1/search/hybrid"
MB = 1024 * 1024
INVALID_IMAGE = "urn:angel:problem:invalid-image"
TOO_LARGE = "urn:angel:problem:upload-too-large"
UNSUPPORTED = "urn:angel:problem:unsupported-media-type"


def encode(image: Image.Image, fmt: str, **kwargs: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format=fmt, **kwargs)
    return buffer.getvalue()


def files(data: bytes, content_type: str = "image/jpeg", name: str = "photo.jpg") -> dict[str, Any]:
    return {"file": (name, data, content_type)}


def padded_jpeg(size_bytes: int) -> bytes:
    """A valid JPEG followed by padding (decoders stop at the end-of-image marker)."""
    base = make_jpeg(1)
    return base + b"\0" * max(0, size_bytes - len(base))


@pytest.fixture
async def small_api(api_factory: ApiFactory) -> AsyncIterator[Any]:
    async with api_factory(seed_count=10) as running:
        yield running


async def test_valid_formats_are_accepted(small_api: Any) -> None:
    photo = Image.open(io.BytesIO(make_jpeg(3)))
    transparent = Image.new("RGBA", (80, 80), (255, 0, 0, 0))
    for data, content_type in (
        (encode(photo, "JPEG"), "image/jpeg"),
        (encode(photo, "PNG"), "image/png"),
        (encode(photo, "WEBP"), "image/webp"),
        (encode(transparent, "PNG"), "image/png"),
        (encode(Image.new("L", (50, 70), 128), "PNG"), "image/png"),
        (encode(Image.new("P", (50, 70)), "PNG", transparency=0), "image/png"),
    ):
        response = await small_api.client.post(IMAGE, files=files(data, content_type))
        assert response.status_code == 200, (content_type, response.text)


async def test_content_type_parameters_and_case_are_tolerated(small_api: Any) -> None:
    response = await small_api.client.post(
        IMAGE, files=files(make_jpeg(3), "IMAGE/JPEG; charset=binary")
    )

    assert response.status_code == 200


@pytest.mark.parametrize(
    "content_type",
    ["text/plain", "application/pdf", "image/gif", "image/svg+xml", "application/octet-stream"],
)
async def test_wrong_declared_type_is_415(small_api: Any, content_type: str) -> None:
    response = await small_api.client.post(IMAGE, files=files(make_jpeg(3), content_type))

    assert response.status_code == 415
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["type"] == UNSUPPORTED
    assert "image/jpeg" in response.json()["allowed"]


@pytest.mark.parametrize(
    ("label", "data"),
    [
        ("text posing as jpeg", b"<html><script>alert(1)</script></html>"),
        ("svg posing as jpeg", b'<svg xmlns="http://www.w3.org/2000/svg" width="9"/>'),
        ("gif posing as jpeg", encode(Image.new("RGB", (20, 20)), "GIF")),
        ("bmp posing as png", encode(Image.new("RGB", (20, 20)), "BMP")),
        ("jpeg header and garbage", b"\xff\xd8\xff\xe0" + b"\x13\x37" * 500),
        ("truncated jpeg", make_jpeg(5, (600, 800))[:2000]),
        ("pure noise", bytes(range(256)) * 20),
    ],
)
async def test_undecodable_or_spoofed_files_are_422(
    small_api: Any, label: str, data: bytes
) -> None:
    response = await small_api.client.post(IMAGE, files=files(data))

    assert response.status_code == 422, label
    assert response.json()["type"] == INVALID_IMAGE
    assert response.headers["content-type"] == "application/problem+json"
    # The message never echoes file content or library internals.
    assert "Traceback" not in response.text
    assert "PIL" not in response.text


async def test_empty_file_is_422(small_api: Any) -> None:
    response = await small_api.client.post(IMAGE, files=files(b""))

    assert response.status_code == 422
    assert response.json()["type"] == INVALID_IMAGE


async def test_missing_file_part_is_422(small_api: Any) -> None:
    response = await small_api.client.post(IMAGE, data={"limit": "3"})

    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"


async def test_non_multipart_body_is_422(small_api: Any) -> None:
    response = await small_api.client.post(IMAGE, json={"file": "x"})

    assert response.status_code == 422


async def test_huge_file_is_413_before_it_is_buffered(small_api: Any) -> None:
    response = await small_api.client.post(IMAGE, files=files(b"\xff\xd8" + b"0" * (9 * MB)))

    assert response.status_code == 413
    assert response.json()["type"] == TOO_LARGE
    assert response.json()["max_bytes"] == 8 * MB


async def test_file_just_over_the_limit_is_413_and_just_under_is_accepted(small_api: Any) -> None:
    over = await small_api.client.post(IMAGE, files=files(padded_jpeg(8 * MB + 100)))
    under = await small_api.client.post(IMAGE, files=files(padded_jpeg(8 * MB - 1000)))

    assert over.status_code == 413
    assert over.json()["type"] == TOO_LARGE
    assert under.status_code == 200


async def test_streamed_body_without_content_length_is_still_limited(small_api: Any) -> None:
    boundary = "x-boundary"
    head = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode()
    tail = f"\r\n--{boundary}--\r\n".encode()

    async def body() -> AsyncIterator[bytes]:
        yield head
        for _ in range(12):  # 12 MB in 1 MB chunks, size never announced
            yield b"0" * MB
        yield tail

    response = await small_api.client.post(
        IMAGE, content=body(), headers={"content-type": f"multipart/form-data; boundary={boundary}"}
    )

    assert response.status_code == 413
    assert response.json()["type"] == TOO_LARGE


async def test_lying_content_length_cannot_smuggle_a_big_body(small_api: Any) -> None:
    boundary = "x-boundary"
    payload = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\n'
            "Content-Type: image/jpeg\r\n\r\n"
        ).encode()
        + b"0" * (10 * MB)
        + f"\r\n--{boundary}--\r\n".encode()
    )

    response = await small_api.client.post(
        IMAGE,
        content=payload,
        headers={
            "content-type": f"multipart/form-data; boundary={boundary}",
            "content-length": "1000",  # announces 1 KB, sends 10 MB
        },
    )

    assert response.status_code in (400, 413, 422)


async def test_decompression_bomb_is_rejected_from_its_header(small_api: Any) -> None:
    # 30000 x 30000 pixels (900 MP, ~900 MB as 8-bit RGB) that compresses to ~100 KB.
    bomb = encode(Image.new("1", (30000, 30000)), "PNG")
    assert len(bomb) < 2 * MB

    started = time.perf_counter()
    response = await small_api.client.post(IMAGE, files=files(bomb, "image/png"))
    elapsed = time.perf_counter() - started

    assert response.status_code == 422
    assert response.json()["type"] == INVALID_IMAGE
    assert elapsed < 2.0  # refused without decoding the pixels


async def test_pixel_limit_boundary(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5, max_upload_pixels=10_000) as api:
        exact = encode(Image.new("RGB", (100, 100), "white"), "PNG")
        over = encode(Image.new("RGB", (101, 100), "white"), "PNG")

        assert (await api.client.post(IMAGE, files=files(exact, "image/png"))).status_code == 200
        assert (await api.client.post(IMAGE, files=files(over, "image/png"))).status_code == 422


async def test_hybrid_endpoint_enforces_the_same_rules(small_api: Any) -> None:
    form = {"query": "blue"}
    wrong_type = await small_api.client.post(
        HYBRID, files=files(make_jpeg(2), "text/plain"), data=form
    )
    corrupt = await small_api.client.post(HYBRID, files=files(b"nope"), data=form)
    huge = await small_api.client.post(HYBRID, files=files(b"0" * (9 * MB)), data=form)

    assert (wrong_type.status_code, corrupt.status_code, huge.status_code) == (415, 422, 413)


async def test_uploads_stay_in_memory(small_api: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """User photos must never be spooled to a temporary file on disk."""

    def forbidden(self: object, *args: object, **kwargs: object) -> None:
        raise AssertionError("upload was written to a temporary file")

    monkeypatch.setattr(tempfile.SpooledTemporaryFile, "rollover", forbidden)
    monkeypatch.setattr(tempfile, "TemporaryFile", forbidden)

    response = await small_api.client.post(IMAGE, files=files(padded_jpeg(6 * MB)))

    assert response.status_code == 200


async def test_exif_orientation_is_applied_and_metadata_never_leaves(small_api: Any) -> None:
    """An EXIF-rotated photo is searched upright, with GPS data and all, never stored."""
    entry = small_api.entries[0]
    original = Image.open(io.BytesIO(entry.jpeg))
    exif = Image.Exif()
    exif[0x0112] = 1  # orientation: normal
    exif[0x010F] = "SecretCameraMaker"
    plain = await small_api.client.post(
        IMAGE, files=files(encode(original, "JPEG", quality=90, exif=exif.tobytes()))
    )

    assert plain.status_code == 200
    assert "SecretCameraMaker" not in plain.text
    assert "exif" not in plain.text.lower()
