"""Загвар харьцуулах сангийн тест (жинхэнэ загваргүй, жижиг гар бодолттой жишээнүүд)."""

from pathlib import Path

import numpy as np
import pytest
import torch
from numpy.typing import NDArray
from PIL import Image

from angel.ml.benchmark import runner
from angel.ml.benchmark.encoders import ENCODERS, build_encoder
from angel.ml.benchmark.report import render_latex, render_markdown
from angel.ml.benchmark.retrieval import (
    build_codes,
    exact_neighbours,
    paired_bootstrap,
    per_query_ap,
    random_neighbours,
    score,
)
from angel.ml.embeddings import Embeddings, ImageArrays

# --- retrieval --------------------------------------------------------------------------------


def unit(rows: list[list[float]]) -> NDArray[np.float32]:
    matrix = np.asarray(rows, dtype=np.float32)
    return matrix / np.linalg.norm(matrix, axis=1, keepdims=True)


def test_exact_neighbours_rank_by_cosine_and_never_return_the_query() -> None:
    embeddings = unit([[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9]])

    ranked = exact_neighbours(embeddings, np.array([0, 2], dtype=np.int64), k=3)

    assert ranked.tolist() == [[1, 3, 2], [3, 1, 0]]


def test_random_neighbours_never_contain_the_query() -> None:
    queries = np.arange(50, dtype=np.int64)

    ranked = random_neighbours(50, queries, k=20, seed=1)

    assert not (ranked == queries[:, None]).any()
    assert ranked.min() >= 0
    assert ranked.max() < 50


def test_score_on_a_hand_computed_ranking() -> None:
    # 0,1 = Shirts/Blue/Men; 2 = Shirts/Red/Men; 3 = Jeans/Blue/Men
    codes = build_codes(
        ["Shirts", "Shirts", "Shirts", "Jeans"],
        ["Blue", "Blue", "Red", "Blue"],
        ["Men", "Men", "Men", "Men"],
    )
    queries = np.array([0], dtype=np.int64)
    ranked = np.array([[2, 1, 3]], dtype=np.int64)  # Shirts, Shirts(Blue), Jeans

    results = score(codes, queries, ranked, [3])

    category = results["category"]["3"]
    assert category["P"] == pytest.approx(2 / 3)
    assert category["recall"] == pytest.approx(1.0)  # 2 бусад Shirts, хоёулаа олдсон
    assert category["mAP"] == pytest.approx((1 + 1) / 2)
    strict = results["strict"]["3"]
    assert strict["hit_rate"] == 1.0
    assert strict["mAP"] == pytest.approx((1 / 2) / 1)  # цорын ганц relevant rank 2 дээр
    assert results["colour"]["3"]["queries_scored"] == 1


def test_queries_without_any_relevant_product_are_skipped() -> None:
    codes = build_codes(["A", "B", "B"], ["x", "x", "x"], ["m", "m", "m"])

    results = score(codes, np.array([0, 1], dtype=np.int64), np.array([[1, 2], [2, 0]]), [2])

    assert results["category"]["2"]["queries_skipped"] == 1
    assert results["category"]["2"]["queries_scored"] == 1


def test_per_query_ap_matches_the_mean_in_the_score() -> None:
    codes = build_codes(["A", "A", "B", "B"], ["x"] * 4, ["m"] * 4)
    queries = np.arange(4, dtype=np.int64)
    ranked = np.array([[1, 2], [0, 3], [3, 0], [2, 1]], dtype=np.int64)

    ap = per_query_ap(codes, queries, ranked, "category", 2)

    assert ap.tolist() == [1.0, 1.0, 1.0, 1.0]
    assert score(codes, queries, ranked, [2])["category"]["2"]["mAP"] == pytest.approx(ap.mean())


# --- paired bootstrap -------------------------------------------------------------------------


def test_bootstrap_of_identical_scores_is_centred_on_zero() -> None:
    scores = np.random.default_rng(0).random(200)

    result = paired_bootstrap(scores, scores.copy(), resamples=200)

    assert result["mean"] == 0.0
    assert result["ci_low"] <= 0.0 <= result["ci_high"]


def test_bootstrap_detects_a_consistent_improvement() -> None:
    base = np.random.default_rng(0).random(300)

    result = paired_bootstrap(base, base + 0.05, resamples=300)

    assert result["mean"] == pytest.approx(0.05)
    assert result["ci_low"] > 0
    assert result["n"] == 300


def test_bootstrap_ignores_queries_that_were_not_scored() -> None:
    result = paired_bootstrap(
        np.array([0.5, np.nan, 0.5]), np.array([0.7, 0.9, np.nan]), resamples=50
    )

    assert result["n"] == 1
    assert result["mean"] == pytest.approx(0.2)


def test_bootstrap_requires_the_same_queries() -> None:
    with pytest.raises(ValueError, match="same queries"):
        paired_bootstrap(np.zeros(3), np.zeros(4))


# --- runner -----------------------------------------------------------------------------------


class StubEncoder:
    """Piksel-ийн дундажаас хамаарах 4 хэмжээст vector. Дуудлагын тоог тоолно."""

    name = "stub"
    version = "stub@1"
    dimension = 4

    def __init__(self) -> None:
        self.calls = 0

    def load(self) -> None: ...

    def encode(self, arrays: ImageArrays) -> Embeddings:
        self.calls += 1
        means = arrays.reshape(len(arrays), -1, 3).mean(axis=1)  # (n, 3)
        vectors = np.concatenate([means, np.ones((len(arrays), 1))], axis=1).astype(np.float32)
        return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)

    def parameters(self) -> int:
        return 7

    def close(self) -> None: ...


@pytest.fixture
def photos(tmp_path: Path) -> list[Path]:
    paths = []
    for n in range(7):
        path = tmp_path / f"{n}.jpg"
        Image.new("RGB", (60, 80), (30 * n, 255 - 30 * n, 90)).save(path)
        paths.append(path)
    return paths


def test_embeddings_are_cached_in_chunks_and_resumed(
    photos: list[Path], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runner, "CHUNK", 3)
    encoder = StubEncoder()
    cache = tmp_path / "cache"

    first = runner.embed_catalogue(encoder, photos, mode="pad", root=cache, batch_size=2, workers=2)
    calls_after_first = encoder.calls
    (next(cache.iterdir()) / "chunk-00002.npy").unlink()  # үргэлжлүүлэх: сүүлийн хэсэг дутуу
    again = runner.embed_catalogue(encoder, photos, mode="pad", root=cache, batch_size=2, workers=2)

    assert first.shape == (7, 4)
    assert np.linalg.norm(first, axis=1) == pytest.approx(np.ones(7))
    assert encoder.calls == calls_after_first + 1  # зөвхөн сүүлийн нэг зургийн хэсэг
    assert np.array_equal(first, again)
    assert len(list(next(cache.iterdir()).glob("chunk-*.npy"))) == 3


def test_cache_is_separate_for_each_preprocessing_mode(photos: list[Path], tmp_path: Path) -> None:
    encoder = StubEncoder()

    cache = tmp_path / "cache"
    runner.embed_catalogue(encoder, photos, mode="pad", root=cache)
    calls = encoder.calls
    runner.embed_catalogue(encoder, photos, mode="crop", root=cache)

    assert encoder.calls > calls
    assert len(list(cache.iterdir())) == 2


def test_latency_is_reported_per_batch_size() -> None:
    arrays = np.zeros((4, 224, 224, 3), dtype=np.uint8)

    result = runner.measure_latency(StubEncoder(), arrays, batch_sizes=(1, 4), repeats=3, warmup=1)

    assert set(result) == {"1", "4"}
    assert result["4"]["batch_p95_ms"] >= result["4"]["batch_p50_ms"] >= 0
    assert result["4"]["per_image_ms"] > 0


# --- encoders, report -------------------------------------------------------------------------


def test_every_registered_encoder_can_be_named() -> None:
    assert set(ENCODERS) == {"fashion-clip", "marqo-fashion-siglip", "resnet50-imagenet"}
    with pytest.raises(ValueError, match="unknown encoder"):
        build_encoder("nope", torch.device("cpu"))


def _report() -> dict[str, object]:
    def level(map_value: float) -> dict[str, dict[str, dict[str, float]]]:
        row = {"mAP": map_value, "P": map_value, "recall": 0.1, "hit_rate": 0.9, "nDCG": map_value}
        return {lv: {"10": dict(row)} for lv in ("category", "colour", "strict")}

    significant = {"mean": 0.1, "ci_low": 0.05, "ci_high": 0.15, "n": 100}
    noise = {"mean": 0.0, "ci_low": -0.02, "ci_high": 0.02, "n": 100}
    return {
        "config": {"reference": "a", "queries": 100, "catalogue_size": 500},
        "models": {
            "a": {
                "dimension": 512,
                "vision_params_m": 87.8,
                "latency": {"32": {"per_image_ms": 4.0}},
                "metrics": level(0.5),
            },
            "b_model": {
                "dimension": 768,
                "vision_params_m": 92.9,
                "latency": {"32": {"per_image_ms": 9.5}},
                "metrics": level(0.6),
            },
        },
        "random_baseline": level(0.02),
        "significance": {"b_model": {"category": significant, "colour": noise, "strict": noise}},
    }


def test_markdown_marks_only_the_significant_differences() -> None:
    table = render_markdown(_report(), 10)

    row = next(line for line in table.splitlines() if line.startswith("| b_model"))
    assert row.count("*") == 1
    assert "0.600*" in row
    assert "| random ranking |" in table
    assert "100 queries over 500 products" in table


def test_latex_table_is_well_formed() -> None:
    table = render_latex(_report(), 10)

    assert table.startswith(r"\begin{tabular}")
    assert table.rstrip().endswith(r"\end{tabular}")
    assert r"b\_model" in table
    assert table.count(r"\\") == 4  # толгой + 2 загвар + random
