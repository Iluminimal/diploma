import pytest
from PIL import Image

from angel.ml.fake import FakeLocalizer
from angel.ml.localizer import WHOLE_IMAGE, Box, WholeImageLocalizer
from angel.ml.yolo import GARMENT_CLASSES, Detection, pad_box, rank_regions

IMAGE = Image.new("RGB", (200, 400), "white")


def detection(x0: float, y0: float, x1: float, y1: float, score: float, label: str) -> Detection:
    return Detection(Box(x0, y0, x1, y1), label, score)


# --- Box ------------------------------------------------------------------------------------


def test_box_converts_to_pixels_inside_the_image() -> None:
    assert Box(0.25, 0.5, 0.75, 1.0).to_pixels(200, 400) == (50, 200, 150, 400)


def test_box_never_collapses_to_nothing_or_leaves_the_image() -> None:
    left, top, right, bottom = Box(0.9999, 0.9999, 1.0, 1.0).to_pixels(200, 400)

    assert (right - left, bottom - top) == (1, 1)
    assert right <= 200
    assert bottom <= 400


def test_box_area() -> None:
    assert Box(0.0, 0.0, 0.5, 0.5).area == pytest.approx(0.25)
    assert WHOLE_IMAGE.area == 1.0


# --- WholeImageLocalizer, FakeLocalizer -------------------------------------------------------


async def test_whole_image_localizer_returns_the_picture_itself() -> None:
    regions = await WholeImageLocalizer().alocate(IMAGE)

    assert len(regions) == 1
    assert regions[0].image is IMAGE
    assert regions[0].box == WHOLE_IMAGE
    assert regions[0].label is None


async def test_fake_localizer_crops_each_box() -> None:
    localizer = FakeLocalizer([Box(0, 0, 1, 0.5), Box(0, 0.5, 0.5, 1)], ["top", "shoe"])

    regions = await localizer.alocate(IMAGE)

    assert [r.label for r in regions] == ["top", "shoe"]
    assert [r.image.size for r in regions] == [(200, 200), (100, 200)]
    assert regions[0].score > regions[1].score
    assert localizer.calls == 1


# --- rank_regions ---------------------------------------------------------------------------


def test_padding_grows_the_box_and_stays_inside_the_image() -> None:
    padded = pad_box(Box(0.1, 0.2, 0.5, 0.6), 0.25)

    assert padded.x0 == pytest.approx(0.0)
    assert padded.y0 == pytest.approx(0.1)
    assert padded.x1 == pytest.approx(0.6)
    assert padded.y1 == pytest.approx(0.7)
    assert pad_box(Box(0.0, 0.0, 1.0, 1.0), 0.5) == WHOLE_IMAGE


def test_the_most_prominent_garment_comes_first() -> None:
    watch = detection(0.4, 0.4, 0.5, 0.45, 0.95, "watch")  # tiny but very confident
    dress = detection(0.1, 0.1, 0.9, 0.9, 0.80, "dress")
    shoe = detection(0.3, 0.8, 0.6, 0.95, 0.60, "shoe")

    regions = rank_regions(IMAGE, [watch, shoe, dress], max_regions=5, min_area=0.0, padding=0.0)

    assert [r.label for r in regions] == ["dress", "shoe", "watch"]


def test_tiny_boxes_are_dropped_and_the_count_is_capped() -> None:
    boxes = [detection(0.0, 0.0, 0.5, 0.5, 0.9 - 0.1 * n, f"item-{n}") for n in range(4)]
    boxes.append(detection(0.0, 0.0, 0.05, 0.05, 0.99, "speck"))

    regions = rank_regions(IMAGE, boxes, max_regions=2, min_area=0.01, padding=0.0)

    assert [r.label for r in regions] == ["item-0", "item-1"]


def test_regions_are_crops_of_the_padded_box() -> None:
    regions = rank_regions(
        IMAGE, [detection(0.25, 0.25, 0.75, 0.75, 0.9, "top")], max_regions=3, min_area=0, padding=0
    )

    assert regions[0].image.size == (100, 200)
    assert regions[0].box == Box(0.25, 0.25, 0.75, 0.75)
    assert regions[0].score == 0.9


def test_without_detections_the_whole_image_is_searched() -> None:
    regions = rank_regions(IMAGE, [], max_regions=3, min_area=0.01, padding=0.05)

    assert len(regions) == 1
    assert regions[0].image is IMAGE
    assert regions[0].label is None


def test_garment_parts_are_not_searchable() -> None:
    assert {"dress", "shoe", "bag, wallet", "pants"} <= GARMENT_CLASSES
    assert not {"sleeve", "pocket", "collar", "zipper", "neckline"} & GARMENT_CLASSES


# --- тохиргоо ---------------------------------------------------------------------------------


async def test_localizer_is_chosen_by_setting_and_the_fake_is_refused_in_production() -> None:
    from angel.core.config import Settings
    from angel.main import _load_localizer

    base = Settings(app_env="test", log_level="WARNING")

    assert isinstance(
        await _load_localizer(base.model_copy(update={"localizer": "whole"})), WholeImageLocalizer
    )
    fake = await _load_localizer(base.model_copy(update={"localizer": "fake"}))
    assert [r.label for r in await fake.alocate(IMAGE)] == ["top, t-shirt, sweatshirt", "shoe"]
    with pytest.raises(ValueError, match="LOCALIZER=fake"):
        Settings(
            app_env="prod",
            localizer="fake",
            jwt_secret="x" * 40,
            payments_mode="qpay",
            qpay_base_url="https://merchant.qpay.mn",
            qpay_client_id="ANGEL",
            qpay_client_secret="secret",
            qpay_invoice_code="ANGEL_INVOICE",
            oauth_mode="google",
            sms_mode="twilio",
        )
