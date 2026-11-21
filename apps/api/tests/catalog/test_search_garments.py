"""POST /search/garments: зурагт олдсон хувцас бүрийн үр дүн нэг дор (detector = FakeLocalizer)."""

import pytest

from angel.ml.fake import FakeLocalizer
from angel.ml.localizer import WHOLE_IMAGE, Box
from tests.conftest import ApiFactory
from tests.support.catalogue import make_jpeg

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

GARMENTS = "/api/v1/search/garments"
TOP = Box(0.0, 0.0, 1.0, 0.5)
SHOES = Box(0.0, 0.5, 1.0, 1.0)
MB = 1024 * 1024


def upload(data: bytes, content_type: str = "image/jpeg") -> dict[str, tuple[str, bytes, str]]:
    return {"file": ("photo.jpg", data, content_type)}


async def test_every_garment_gets_its_own_results(api_factory: ApiFactory) -> None:
    localizer = FakeLocalizer([TOP, SHOES], ["top", "shoe"])
    async with api_factory(localizer=localizer) as api:
        response = await api.client.post(GARMENTS, files=upload(api.entries[0].jpeg))

    body = response.json()
    assert response.status_code == 200
    assert [g["index"] for g in body["garments"]] == [0, 1]
    assert [g["region"]["label"] for g in body["garments"]] == ["top", "shoe"]
    assert body["garments"][1]["region"]["box"] == {"x": 0.0, "y": 0.5, "width": 1.0, "height": 0.5}
    for garment in body["garments"]:
        assert len(garment["results"]) == 12  # хувцас тутмын default
        assert len(garment["detected"]) == 3
        similarities = [hit["similarity"] for hit in garment["results"]]
        assert similarities == sorted(similarities, reverse=True)
    timings = body["timings"]
    assert timings["detect_ms"] >= 0
    assert timings["total_ms"] >= timings["db_ms"]


async def test_results_come_from_each_crop_not_from_the_whole_photo(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(localizer=FakeLocalizer([WHOLE_IMAGE, TOP])) as api:
        response = await api.client.post(GARMENTS, files=upload(api.entries[4].jpeg))

    whole, top = response.json()["garments"]
    # Бүтэн зургийн хэсэг нь барааны өөрийн зураг: 1-р байранд. Тайрсан хэсэг нь өөр vector.
    assert whole["results"][0]["product"]["id"] == api.entries[4].product_id
    assert top["results"][0]["similarity"] < 0.9
    assert top["results"][0]["product"]["id"] != whole["results"][0]["product"]["id"]


async def test_all_crops_are_embedded_in_one_model_call(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES, WHOLE_IMAGE])) as api:
        before = api.embedder.calls
        images_before = api.embedder.images_embedded
        await api.client.post(GARMENTS, files=upload(api.entries[0].jpeg))

    assert api.embedder.calls == before + 1
    assert api.embedder.images_embedded == images_before + 3


async def test_limit_applies_to_each_garment(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES])) as api:
        response = await api.client.post(
            GARMENTS, files=upload(api.entries[0].jpeg), data={"limit": "3"}
        )

    assert [len(g["results"]) for g in response.json()["garments"]] == [3, 3]


async def test_filters_apply_to_every_garment(api_factory: ApiFactory) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES])) as api:
        response = await api.client.post(
            GARMENTS,
            files=upload(api.entries[0].jpeg),
            data={"article_type": "Shirts", "limit": "5"},
        )

    for garment in response.json()["garments"]:
        assert garment["results"]
        assert {hit["product"]["article_type"] for hit in garment["results"]} == {"Shirts"}


async def test_a_photo_without_detections_is_one_garment_like_image_search(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:  # localizer=whole
        photo = upload(api.entries[2].jpeg)
        garments = await api.client.post(GARMENTS, files=photo, data={"limit": "5"})
        single = await api.client.post("/api/v1/search/image", files=photo, data={"limit": "5"})

    body = garments.json()
    assert len(body["garments"]) == 1
    assert body["garments"][0]["region"]["label"] is None
    assert [h["product"]["id"] for h in body["garments"][0]["results"]] == [
        h["product"]["id"] for h in single.json()["results"]
    ]


async def test_garment_index_selects_the_same_region_in_image_search(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(localizer=FakeLocalizer([TOP, SHOES], ["top", "shoe"])) as api:
        photo = upload(api.entries[0].jpeg)
        garments = await api.client.post(GARMENTS, files=photo, data={"limit": "6"})
        single = await api.client.post(
            "/api/v1/search/image", files=photo, data={"region": "1", "limit": "6"}
        )

    assert [h["product"]["id"] for h in garments.json()["garments"][1]["results"]] == [
        h["product"]["id"] for h in single.json()["results"]
    ]


# --- upload хамгаалалт: шинэ замд ч /search/image-тэй ижил ----------------------------------


@pytest.mark.parametrize("content_type", ["text/plain", "image/gif", "application/pdf"])
async def test_wrong_declared_type_is_415(api_factory: ApiFactory, content_type: str) -> None:
    async with api_factory(seed_count=3) as api:
        response = await api.client.post(GARMENTS, files=upload(make_jpeg(3), content_type))

    assert response.status_code == 415


async def test_undecodable_file_is_422(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=3) as api:
        response = await api.client.post(GARMENTS, files=upload(b"not an image at all" * 50))

    assert response.status_code == 422
    assert response.json()["type"] == "urn:angel:problem:invalid-image"


async def test_oversized_upload_is_refused_before_it_is_buffered(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=3) as api:
        response = await api.client.post(GARMENTS, files=upload(b"\xff\xd8" + b"0" * (9 * MB)))

    assert response.status_code == 413
    assert response.json()["type"] == "urn:angel:problem:upload-too-large"


async def test_it_shares_the_image_rate_limit_bucket(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=3, rate_limit_image="1/60") as api:
        photo = upload(api.entries[0].jpeg)
        first = await api.client.post(GARMENTS, files=photo)
        second = await api.client.post(GARMENTS, files=photo)

    assert (first.status_code, second.status_code) == (200, 429)
