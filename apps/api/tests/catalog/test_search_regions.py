"""Зураг дээрх олон хэсгээс хайх (detector-ийг FakeLocalizer-ээр орлуулсан)."""

import pytest

from angel.ml.fake import FakeLocalizer
from angel.ml.localizer import WHOLE_IMAGE, Box
from tests.conftest import ApiFactory
from tests.support.catalogue import make_jpeg

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

SEARCH = "/api/v1/search"
TOP = Box(0.0, 0.0, 1.0, 0.5)
SHOES = Box(0.0, 0.5, 1.0, 1.0)


def upload(data: bytes) -> dict[str, tuple[str, bytes, str]]:
    return {"file": ("photo.jpg", data, "image/jpeg")}


async def test_response_lists_every_region_and_the_selected_one(
    api_factory: ApiFactory,
) -> None:
    localizer = FakeLocalizer([TOP, SHOES], ["top", "shoe"])
    async with api_factory(localizer=localizer) as api:
        response = await api.client.post(f"{SEARCH}/image", files=upload(api.entries[0].jpeg))

    body = response.json()
    assert response.status_code == 200
    assert body["selected_region"] == 0
    assert [r["label"] for r in body["regions"]] == ["top", "shoe"]
    assert body["regions"][1]["box"] == {"x": 0.0, "y": 0.5, "width": 1.0, "height": 0.5}
    assert body["timings"]["detect_ms"] >= 0


async def test_each_region_is_embedded_and_searched_on_its_own(api_factory: ApiFactory) -> None:
    whole_then_part = FakeLocalizer([WHOLE_IMAGE, TOP], ["garment", "top"])
    async with api_factory(localizer=whole_then_part) as api:
        photo = upload(api.entries[4].jpeg)
        first = await api.client.post(f"{SEARCH}/image", files=photo, data={"region": "0"})
        second = await api.client.post(f"{SEARCH}/image", files=photo, data={"region": "1"})

    # Бүтэн зургийн хэсэг нь барааны өөрийн зураг: 1-р байранд гарна. Тайрсан хэсэг нь өөр vector.
    assert first.json()["results"][0]["product"]["id"] == api.entries[4].product_id
    assert second.json()["selected_region"] == 1
    assert second.json()["results"][0]["similarity"] < 0.9
    assert second.json()["regions"] == first.json()["regions"]


async def test_region_out_of_range_is_rejected(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES])) as api:
        embedded_before = api.embedder.images_embedded
        response = await api.client.post(
            f"{SEARCH}/image", files=upload(api.entries[0].jpeg), data={"region": "2"}
        )

    assert response.status_code == 422
    assert response.json()["title"] == "Хэсэг олдсонгүй"
    assert api.embedder.images_embedded == embedded_before  # хүчингүй хүсэлтэд model ажиллаагүй


@pytest.mark.parametrize("region", ["-1", "20", "abc"])
async def test_region_must_be_a_small_non_negative_integer(
    api_factory: ApiFactory, region: str
) -> None:
    async with api_factory() as api:
        response = await api.client.post(
            f"{SEARCH}/image", files=upload(api.entries[0].jpeg), data={"region": region}
        )

    assert response.status_code == 422


async def test_without_a_detector_the_whole_image_is_the_only_region(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:  # localizer=whole
        response = await api.client.post(f"{SEARCH}/image", files=upload(api.entries[0].jpeg))

    body = response.json()
    assert body["regions"] == [
        {"box": {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}, "label": None, "score": 1.0}
    ]
    assert body["selected_region"] == 0


async def test_hybrid_search_honours_the_region_too(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES], ["top", "shoe"])) as api:
        response = await api.client.post(
            f"{SEARCH}/hybrid",
            files=upload(make_jpeg(999)),
            data={"query": "blue", "region": "1"},
        )

    body = response.json()
    assert response.status_code == 200
    assert body["selected_region"] == 1
    assert len(body["regions"]) == 2


async def test_text_and_similar_searches_have_no_regions(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP])) as api:
        text = await api.client.post(f"{SEARCH}/text", json={"query": "blue shirt"})

    assert text.json()["regions"] == []
    assert text.json()["selected_region"] is None
