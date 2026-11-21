"""Embedding-ийн чанарыг хэмжих: exact хайлт, mAP, P@K, nDCG, мөн paired bootstrap.

`scripts/evaluate_map.py` (DB дахь FashionCLIP) болон `scripts/benchmark_models.py` (олон загвар)
хоёул ашиглана. Query нь каталогийн нэг бүтээгдэхүүн; хайлт түүнд хамгийн ойрыг буцаана (өөрийг
нь оруулахгүй). Ижил label-тэй бол *relevant*; label-ийг гурван түвшинд авна (`LEVELS`).
"""

from collections.abc import Sequence

import numpy as np
from numpy.typing import NDArray

from angel.ml import metrics

LEVELS = ("category", "colour", "strict")
RELEVANCE = {
    "category": "same article type",
    "colour": "same article type and base colour",
    "strict": "same article type, base colour and gender",
}

Codes = dict[str, NDArray[np.int64]]
Results = dict[str, dict[str, dict[str, float | int]]]


def build_codes(
    article_types: Sequence[str | None],
    colours: Sequence[str | None],
    genders: Sequence[str | None],
) -> Codes:
    """Түвшин бүрийн label-ийг бүхэл тоо код болгоно (`metrics.encode_labels`)."""
    return {
        "category": metrics.encode_labels(article_types),
        "colour": metrics.encode_labels(article_types, colours),
        "strict": metrics.encode_labels(article_types, colours, genders),
    }


def exact_neighbours(
    embeddings: NDArray[np.float32], queries: NDArray[np.int64], k: int, batch: int = 1000
) -> NDArray[np.int64]:
    """Query мөр бүрт хамгийн ойр k бүтээгдэхүүний мөр (cosine), өөрийг нь оруулахгүй.

    Embedding нь L2-normalize хийгдсэн тул cosine нь dot product."""
    ranked = np.empty((len(queries), k), dtype=np.int64)
    for start in range(0, len(queries), batch):
        rows = queries[start : start + batch]
        similarity = embeddings[rows] @ embeddings.T
        similarity[np.arange(len(rows)), rows] = -np.inf
        top = np.argpartition(-similarity, k, axis=1)[:, :k]
        order = np.argsort(-np.take_along_axis(similarity, top, axis=1), axis=1)
        ranked[start : start + batch] = np.take_along_axis(top, order, axis=1)
    return ranked


def random_neighbours(
    size: int, queries: NDArray[np.int64], k: int, seed: int
) -> NDArray[np.int64]:
    """Baseline: санамсаргүй сонгосон k бүтээгдэхүүн (query-г хэзээ ч оруулахгүй)."""
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, size - 1, size=(len(queries), k))
    return np.where(draws >= queries[:, None], draws + 1, draws)


def score(
    codes: Codes, queries: NDArray[np.int64], ranked: NDArray[np.int64], ks: list[int]
) -> Results:
    """Relevance түвшин бүрийн, K бүрийн бүх metric."""
    results: Results = {}
    for level in LEVELS:
        level_codes = codes[level]
        total = metrics.relevant_counts(level_codes)[queries]
        relevance = metrics.relevance_at_ranks(level_codes, queries, ranked)
        per_k: dict[str, dict[str, float | int]] = {}
        for k in ks:
            average, skipped = metrics.mean_valid(metrics.average_precision(relevance, total, k))
            per_k[str(k)] = {
                "mAP": average,
                "mAP_retrieved_norm": metrics.mean_valid(
                    metrics.average_precision(relevance, total, k, normalise="retrieved")
                )[0],
                "P": metrics.mean_valid(metrics.precision_at_k(relevance, total, k))[0],
                "recall": metrics.mean_valid(metrics.recall_at_k(relevance, total, k))[0],
                "hit_rate": metrics.mean_valid(metrics.hit_rate_at_k(relevance, total, k))[0],
                "nDCG": metrics.mean_valid(metrics.ndcg_at_k(relevance, total, k))[0],
                "queries_scored": int(len(queries) - skipped),
                "queries_skipped": skipped,
            }
        results[level] = per_k
    return results


def per_query_ap(
    codes: Codes, queries: NDArray[np.int64], ranked: NDArray[np.int64], level: str, k: int
) -> metrics.Scores:
    """Query бүрийн AP@K (relevant байхгүй query-д nan): bootstrap-д хэрэгтэй."""
    total = metrics.relevant_counts(codes[level])[queries]
    relevance = metrics.relevance_at_ranks(codes[level], queries, ranked)
    return metrics.average_precision(relevance, total, k)


def paired_bootstrap(
    baseline: metrics.Scores,
    other: metrics.Scores,
    *,
    resamples: int = 2000,
    seed: int = 0,
) -> dict[str, float]:
    """`other - baseline`-ийн дундаж зөрүү ба 95%-ийн итгэлийн завсар (paired bootstrap).

    Хоёр загварыг ИЖИЛ query дээр хэмжсэн тул query бүрийн зөрүүг дахин түүвэрлэнэ. Завсар 0-г
    агуулахгүй бол зөрүү санамсаргүй биш гэж үзнэ. Аль нэгд оноогүй (nan) query-г хасна."""
    if baseline.shape != other.shape:
        raise ValueError("both score arrays must cover the same queries")
    valid = ~(np.isnan(baseline) | np.isnan(other))
    difference = (other - baseline)[valid]
    if len(difference) == 0:
        return {"mean": float("nan"), "ci_low": float("nan"), "ci_high": float("nan"), "n": 0}
    rng = np.random.default_rng(seed)
    draws = rng.integers(0, len(difference), size=(resamples, len(difference)))
    means = difference[draws].mean(axis=1)
    low, high = np.percentile(means, [2.5, 97.5])
    return {
        "mean": float(difference.mean()),
        "ci_low": float(low),
        "ci_high": float(high),
        "n": len(difference),
    }
