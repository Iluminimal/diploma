"""Жинхэнэ FashionCLIP model-ийн тест (~600 MB нэг удаа татна). `make test-ml`-ээр ажиллуулна."""

import asyncio
from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
import torch
from PIL import Image

from angel.core.config import get_settings
from angel.ingestion.cleaning import CleanProduct, load_catalog
from angel.ml.fashion_clip import FashionClipEmbedder, select_device
from angel.ml.preprocess import load_image

pytestmark = pytest.mark.model


@pytest.fixture(scope="module")
def embedder() -> Iterator[FashionClipEmbedder]:
    instance = FashionClipEmbedder(device=select_device("auto"))
    instance.load()
    yield instance
    instance.close()


@pytest.fixture(scope="module")
def real_products() -> dict[str, list[CleanProduct]]:
    """Dataset-ийн хэдэн жинхэнэ цамц, гутал (dataset байхгүй бол алгасна)."""
    dataset = get_settings().dataset_dir
    if dataset is None or not (dataset.expanduser() / "styles.csv").exists():
        pytest.skip("DATASET_DIR not set")
    dataset = dataset.expanduser()
    products, _ = load_catalog(dataset / "styles.csv", dataset / "images")
    by_type: dict[str, list[CleanProduct]] = {"Tshirts": [], "Casual Shoes": [], "Watches": []}
    for product in products:
        bucket = by_type.get(product.article_type)
        if bucket is not None and len(bucket) < 4:
            bucket.append(product)
    return by_type


def _images(products: list[CleanProduct]) -> list[Image.Image]:
    return [load_image(p.image_path, min_side=800) for p in products]


def test_embeddings_are_512_dimensional_unit_vectors(embedder: FashionClipEmbedder) -> None:
    vectors = embedder.embed_images([Image.new("RGB", (300, 400), (200, 20, 20))])
    assert vectors.shape == (1, 512)
    assert vectors.dtype == np.float32
    assert np.linalg.norm(vectors[0]) == pytest.approx(1.0, abs=1e-5)
    texts = embedder.embed_texts(["a red dress", "blue jeans"])
    assert texts.shape == (2, 512)
    np.testing.assert_allclose(np.linalg.norm(texts, axis=1), 1.0, atol=1e-5)


def test_embedding_is_deterministic_and_batch_independent(embedder: FashionClipEmbedder) -> None:
    rng = np.random.default_rng(0)
    images = [
        Image.fromarray(rng.integers(0, 255, (200, 150, 3), dtype=np.uint8)) for _ in range(5)
    ]
    together = embedder.embed_images(images)
    again = embedder.embed_images(images)
    alone = embedder.embed_images(images[2:3])
    np.testing.assert_allclose(together, again, atol=1e-6)
    assert float(together[2] @ alone[0]) > 0.9999


def test_same_class_is_closer_than_different_class(
    embedder: FashionClipEmbedder, real_products: dict[str, list[CleanProduct]]
) -> None:
    shirts = embedder.embed_images(_images(real_products["Tshirts"]))
    shoes = embedder.embed_images(_images(real_products["Casual Shoes"]))
    within = float((shirts @ shirts.T)[np.triu_indices(len(shirts), 1)].mean())
    across = float((shirts @ shoes.T).mean())
    assert within > across + 0.1


def test_zero_shot_text_picks_the_right_category(
    embedder: FashionClipEmbedder, real_products: dict[str, list[CleanProduct]]
) -> None:
    labels = ["Tshirts", "Casual Shoes", "Watches"]
    text = embedder.embed_texts([f"a photo of a {label.lower()}" for label in labels])
    for expected in labels:
        vectors = embedder.embed_images(_images(real_products[expected]))
        predicted = (vectors @ text.T).argmax(axis=1)
        assert (predicted == labels.index(expected)).mean() >= 0.75


def test_image_embedding_does_not_depend_on_jpeg_scale_decoding(
    embedder: FashionClipEmbedder, real_products: dict[str, list[CleanProduct]]
) -> None:
    products = real_products["Tshirts"]
    draft = embedder.embed_images([load_image(p.image_path, min_side=800) for p in products])
    full = embedder.embed_images([load_image(p.image_path) for p in products])
    assert float((draft * full).sum(axis=1).min()) > 0.99


@pytest.mark.skipif(select_device("auto").type == "cpu", reason="fp16 is only used on accelerators")
def test_fp16_agrees_with_fp32(
    embedder: FashionClipEmbedder, real_products: dict[str, list[CleanProduct]]
) -> None:
    half = FashionClipEmbedder(device=embedder.device, fp16=True)
    half.load()
    images = _images(real_products["Tshirts"] + real_products["Watches"])
    a, b = embedder.embed_images(images), half.embed_images(images)
    assert np.isfinite(b).all()
    assert float((a * b).sum(axis=1).min()) > 0.999


def test_cpu_and_accelerator_agree(
    embedder: FashionClipEmbedder, real_products: dict[str, list[CleanProduct]]
) -> None:
    cpu = FashionClipEmbedder(device=torch.device("cpu"))
    cpu.load()
    images = _images(real_products["Watches"])
    assert (
        float((embedder.embed_images(images) * cpu.embed_images(images)).sum(axis=1).min()) > 0.999
    )


async def test_async_api_runs_off_the_event_loop_and_serialises(
    embedder: FashionClipEmbedder,
) -> None:
    images = [Image.new("RGB", (100, 120), (i * 20, 50, 90)) for i in range(4)]
    ticks = 0

    async def ticker() -> None:
        nonlocal ticks
        while True:
            await asyncio.sleep(0.001)
            ticks += 1

    task = asyncio.create_task(ticker())
    results = await asyncio.gather(*(embedder.aembed_images([image]) for image in images))
    task.cancel()
    assert ticks > 0  # inference явагдах хооронд loop зогсолгүй ажилласан
    expected = embedder.embed_images(images)
    for index, result in enumerate(results):
        np.testing.assert_allclose(result[0], expected[index], atol=1e-5)


def test_embedding_requires_a_loaded_model(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="not loaded"):
        FashionClipEmbedder(device=torch.device("cpu")).embed_images([Image.new("RGB", (10, 10))])
