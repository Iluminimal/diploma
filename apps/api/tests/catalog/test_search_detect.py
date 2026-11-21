"""POST /search/detect: камерын live preview-ийн кадраас хувцсыг олох (embedding, DB-гүй)."""

import pytest

from angel.ml.fake import FakeLocalizer
from angel.ml.localizer import Box
from tests.conftest import ApiFactory
from tests.support.catalogue import make_jpeg

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

DETECT = "/api/v1/search/detect"
TOP = Box(0.0, 0.0, 1.0, 0.5)
SHOES = Box(0.0, 0.5, 1.0, 1.0)
MB = 1024 * 1024


def upload(data: bytes, content_type: str = "image/jpeg") -> dict[str, tuple[str, bytes, str]]:
    return {"file": ("frame.jpg", data, content_type)}


async def test_returns_the_garment_boxes_of_the_frame(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES], ["top", "shoe"])) as api:
        response = await api.client.post(DETECT, files=upload(make_jpeg(1, (320, 240))))

    body = response.json()
    assert response.status_code == 200
    assert [r["label"] for r in body["regions"]] == ["top", "shoe"]
    assert body["regions"][1]["box"] == {"x": 0.0, "y": 0.5, "width": 1.0, "height": 0.5}
    assert body["detect_ms"] >= 0
    assert set(body) == {"regions", "detect_ms"}  # хайлтын үр дүн, цаг хугацаа байхгүй


async def test_does_not_embed_or_search(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES])) as api:
        calls, images = api.embedder.calls, api.embedder.images_embedded
        texts = api.embedder.texts_embedded
        for _ in range(3):
            response = await api.client.post(DETECT, files=upload(make_jpeg(2)))
            assert response.status_code == 200

    assert (api.embedder.calls, api.embedder.images_embedded) == (calls, images)
    assert api.embedder.texts_embedded == texts


async def test_without_a_detector_the_frame_is_one_unlabelled_region(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:  # localizer=whole, каталог хоосон: DB хэрэггүй
        response = await api.client.post(DETECT, files=upload(make_jpeg(3)))

    assert response.json()["regions"] == [
        {"box": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}, "label": None, "score": 1.0}
    ]


# --- upload хамгаалалт: /search/image-тэй ижил ---------------------------------------------


@pytest.mark.parametrize("content_type", ["text/plain", "image/gif", "application/pdf"])
async def test_wrong_declared_type_is_415(api_factory: ApiFactory, content_type: str) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(DETECT, files=upload(make_jpeg(3), content_type))

    assert response.status_code == 415


async def test_undecodable_frame_is_422(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(DETECT, files=upload(b"not an image" * 40))

    assert response.status_code == 422
    assert response.json()["type"] == "urn:angel:problem:invalid-image"


async def test_oversized_frame_is_refused_before_it_is_buffered(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(DETECT, files=upload(b"\xff\xd8" + b"0" * (9 * MB)))

    assert response.status_code == 413


# --- rate limit: live нь хайлтын bucket-ыг дуусгахгүй, хайлт нь live-г таслахгүй -----------------


async def test_it_has_its_own_rate_limit_bucket(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=3, rate_limit_image="1/60", rate_limit_detect="3/60") as api:
        frames = [await api.client.post(DETECT, files=upload(make_jpeg(4))) for _ in range(4)]
        search = await api.client.post("/api/v1/search/image", files=upload(api.entries[0].jpeg))

    assert [r.status_code for r in frames] == [200, 200, 200, 429]
    assert search.status_code == 200  # live кадрууд `image` bucket-аас хасагдаагүй
