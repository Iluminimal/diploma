import numpy as np
import pytest

from lookalike.ml.classifier import (
    CategoryLabel,
    LazyCategoryClassifier,
    WholeImageLocalizer,
    ZeroShotCategoryClassifier,
)
from lookalike.ml.fake import FakeEmbedder

LABELS = [
    CategoryLabel("Shirts", "apparel/topwear/shirts", "Shirts"),
    CategoryLabel("Jeans", "apparel/bottomwear/jeans", "Jeans"),
    CategoryLabel("Casual Shoes", "footwear/shoes/casual-shoes", "Casual Shoes"),
]
AXES = np.eye(3, 512, dtype=np.float32)  # three orthogonal label embeddings


def unit(vector: np.ndarray) -> np.ndarray:
    return np.asarray(vector / np.linalg.norm(vector), dtype=np.float32)


def classifier(scale: float = 100.0) -> ZeroShotCategoryClassifier:
    return ZeroShotCategoryClassifier(LABELS, AXES, scale)


def test_closest_label_wins_and_probabilities_are_ordered() -> None:
    image = unit(AXES[1] * 0.9 + AXES[0] * 0.2)

    predictions = classifier().predict(image, top_k=3)

    assert [p.label.article_type for p in predictions] == ["Jeans", "Shirts", "Casual Shoes"]
    scores = [p.score for p in predictions]
    assert scores == sorted(scores, reverse=True)
    assert sum(scores) == pytest.approx(1.0)
    assert predictions[0].score > 0.99


def test_top_k_limits_the_result() -> None:
    assert len(classifier().predict(AXES[0], top_k=2)) == 2
    assert len(classifier().predict(AXES[0], top_k=10)) == 3


def test_a_lower_temperature_spreads_the_probability() -> None:
    image = unit(AXES[0] + AXES[1])

    sharp = classifier(100.0).predict(image, 3)[0].score
    flat = classifier(1.0).predict(image, 3)[0].score

    assert flat < sharp
    assert flat == pytest.approx(1 / 3, abs=0.1)


def test_no_labels_means_no_predictions() -> None:
    empty = ZeroShotCategoryClassifier([], np.zeros((0, 512), dtype=np.float32), 100.0)

    assert empty.predict(AXES[0], 3) == []


def test_labels_and_embeddings_must_match() -> None:
    with pytest.raises(ValueError, match="one embedding per label"):
        ZeroShotCategoryClassifier(LABELS, AXES[:2], 100.0)


async def test_build_embeds_one_prompt_per_label() -> None:
    embedder = FakeEmbedder()

    built = await ZeroShotCategoryClassifier.build(embedder, LABELS)

    assert embedder.texts_embedded == 3
    assert len(built.predict(embedder.embed_texts(["a photo of jeans"])[0], 3)) == 3
    top = built.predict(embedder.embed_texts(["a photo of jeans"])[0], 1)[0]
    assert top.label.article_type == "Jeans"  # same prompt text as the label's own embedding


async def test_lazy_classifier_builds_once_and_retries_after_failure() -> None:
    attempts = 0
    ready = classifier()

    async def factory() -> ZeroShotCategoryClassifier:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise ConnectionError("database not up yet")
        return ready

    lazy = LazyCategoryClassifier(factory)
    with pytest.raises(ConnectionError):
        await lazy.get()

    assert await lazy.get() is ready
    assert await lazy.get() is ready
    assert attempts == 2


def test_whole_image_localizer_returns_the_picture_itself() -> None:
    from PIL import Image

    image = Image.new("RGB", (10, 10))

    assert WholeImageLocalizer().locate(image) == [image]
