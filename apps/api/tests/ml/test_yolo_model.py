"""Жинхэнэ YOLO detector-ийн тест (~200 MB нэг удаа татна). `make test-ml`-ээр ажиллуулна."""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from PIL import Image

from angel.core.config import get_settings
from angel.ml.fashion_clip import select_device
from angel.ml.preprocess import load_image
from angel.ml.yolo import YoloGarmentLocalizer

pytestmark = pytest.mark.model


@pytest.fixture(scope="module")
def localizer() -> Iterator[YoloGarmentLocalizer]:
    instance = YoloGarmentLocalizer(device=select_device("auto"))
    instance.load()
    yield instance
    instance.close()


@pytest.fixture(scope="module")
def collage() -> Image.Image:
    """Dataset-ийн цамц, өмд, гутлыг зэрэгцүүлсэн нэг зураг (dataset байхгүй бол алгасна)."""
    dataset = get_settings().dataset_dir
    if dataset is None or not (dataset.expanduser() / "styles.csv").exists():
        pytest.skip("DATASET_DIR not set")
    root = dataset.expanduser()
    styles = pd.read_csv(root / "styles.csv", on_bad_lines="skip")
    canvas = Image.new("RGB", (900, 400), "white")
    for slot, article_type in enumerate(("Tshirts", "Jeans", "Casual Shoes")):
        product_id = int(styles[styles["articleType"] == article_type]["id"].iloc[0])
        photo = load_image(Path(root / "images" / f"{product_id}.jpg")).resize((300, 400))
        canvas.paste(photo, (300 * slot, 0))
    return canvas


def test_a_blank_image_falls_back_to_the_whole_image(localizer: YoloGarmentLocalizer) -> None:
    regions = localizer.locate(Image.new("RGB", (300, 400), "white"))

    assert len(regions) == 1
    assert regions[0].label is None


def test_each_garment_in_a_collage_gets_its_own_region(
    localizer: YoloGarmentLocalizer, collage: Image.Image
) -> None:
    regions = localizer.locate(collage)

    labels = " | ".join(r.label or "" for r in regions)
    assert len(regions) >= 3
    assert "shoe" in labels
    assert "pants" in labels
    assert "top" in labels
    # Хэсэг бүр өөр нэг зүйл: гутлын хайрцаг баруун гуравны нэгд, цамцных зүүн гуравны нэгд.
    shoe = next(r for r in regions if r.label == "shoe")
    top = next(r for r in regions if r.label and r.label.startswith("top"))
    assert shoe.box.x0 > top.box.x1 - 0.05
