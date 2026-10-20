"""Visual search-ийн чанарыг хэмжих metric-үүд: P@K, recall@K, hit rate, nDCG@K, (mean) AP.

Функц бүр *relevance matrix* авна: мөр = query, багана = rank. Тухайн rank дээр буцсан
бүтээгдэхүүн query-д relevant бол `True`. Каталогт relevant бүтээгдэхүүн огт байхгүй query
(`total_relevant == 0`) оноогүй тул `nan` буцна; `mean_valid` бусдын дунджийг авч, хэдийг
алгассаныг хэлнэ.

Нэг query-ийн AP = `i <= K байх rank бүрийн P@i * rel_i`-ийн нийлбэрийг хуваана: K дотор олж
болох relevant-ийн тоо `min(K, R)` (default), эсвэл өөр нийтлэг аргаар бодитоор олсон тоо.
Бүх query-ийн дундаж нь mAP.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

import numpy as np
from numpy.typing import NDArray

Relevance = NDArray[np.bool_]
Counts = NDArray[np.int64]
Scores = NDArray[np.float64]
Normalise = Literal["min_k_r", "retrieved"]


def encode_labels(*columns: Sequence[str | None]) -> NDArray[np.int64]:
    """Label баганын хослол бүрт нэг бүхэл тоо оноож өгнө.

    Аль нэг баганад label дутуу мөр нь сөрөг, давтагдахгүй код авна. Ингэснээр дутуу label-тэй
    мөр хэнтэй ч relevant болохгүй (өөр дутуу мөртэй ч).
    """
    rows = len(columns[0])
    codes = np.empty(rows, dtype=np.int64)
    known: dict[tuple[str, ...], int] = {}
    for row in range(rows):
        parts = [column[row] for column in columns]
        if any(part is None for part in parts):
            codes[row] = -(row + 1)
        else:
            codes[row] = known.setdefault(tuple(p for p in parts if p is not None), len(known))
    return codes


def relevant_counts(codes: NDArray[np.int64]) -> Counts:
    """Мөр бүрт ижил кодтой *бусад* мөрийн тоо: тэр мөрөөр хайхад олдох relevant-ийн тоо."""
    counts = np.zeros(len(codes), dtype=np.int64)
    labelled = codes >= 0
    if labelled.any():
        sizes = np.bincount(codes[labelled])
        counts[labelled] = sizes[codes[labelled]] - 1
    return counts


def relevance_at_ranks(
    codes: NDArray[np.int64], query_rows: NDArray[np.int64], ranked_rows: NDArray[np.int64]
) -> Relevance:
    """`ranked_rows[q, r]` нь q query-ийн r rank-д буцсан каталогийн мөр; relevant эсэх."""
    wanted = codes[query_rows][:, None]
    same: Relevance = (codes[ranked_rows] == wanted) & (wanted >= 0)
    return same


def _top(relevance: Relevance, k: int) -> NDArray[np.float64]:
    if not 1 <= k <= relevance.shape[1]:
        raise ValueError(f"k={k} is outside the {relevance.shape[1]} ranks that were retrieved")
    return relevance[:, :k].astype(np.float64)


def _defined(total_relevant: Counts, values: Scores) -> Scores:
    return np.where(total_relevant > 0, values, np.nan)


def precision_at_k(relevance: Relevance, total_relevant: Counts, k: int) -> Scores:
    """Эхний K-ийн relevant хувь."""
    return _defined(total_relevant, _top(relevance, k).sum(axis=1) / k)


def recall_at_k(relevance: Relevance, total_relevant: Counts, k: int) -> Scores:
    """Нийт relevant бүтээгдэхүүний хэдийг нь эхний K дотор олсон хувь."""
    hits = _top(relevance, k).sum(axis=1)
    return _defined(total_relevant, hits / np.maximum(total_relevant, 1))


def hit_rate_at_k(relevance: Relevance, total_relevant: Counts, k: int) -> Scores:
    """Эхний K-д дор хаяж нэг relevant байвал 1, үгүй бол 0."""
    return _defined(total_relevant, (_top(relevance, k).sum(axis=1) > 0).astype(np.float64))


def average_precision(
    relevance: Relevance, total_relevant: Counts, k: int, normalise: Normalise = "min_k_r"
) -> Scores:
    """Query бүрийн AP@K (хоёр normalisation-ийг модулийн docstring-оос үз)."""
    top = _top(relevance, k)
    hits = np.cumsum(top, axis=1)
    precision = hits / np.arange(1, k + 1)
    gained = (precision * top).sum(axis=1)
    best = np.minimum(k, total_relevant) if normalise == "min_k_r" else hits[:, -1]
    scores = np.where(best > 0, gained / np.maximum(best, 1), 0.0)
    return _defined(total_relevant, scores)


def ndcg_at_k(relevance: Relevance, total_relevant: Counts, k: int) -> Scores:
    """Binary gain-тэй nDCG@K: дээд rank-ийн relevant илүү жинтэй (1 / log2(rank + 1))."""
    top = _top(relevance, k)
    discount = 1.0 / np.log2(np.arange(2, k + 2))
    ideal = np.concatenate([[0.0], np.cumsum(discount)])[np.minimum(k, total_relevant)]
    gained = (top * discount).sum(axis=1)
    return _defined(total_relevant, gained / np.maximum(ideal, 1e-12))


def mean_valid(scores: Scores) -> tuple[float, int]:
    """Оноотой query-үүдийн дундаж, мөн оноогүй (алгассан) query-ийн тоо."""
    valid = ~np.isnan(scores)
    if not valid.any():
        return float("nan"), len(scores)
    return float(scores[valid].mean()), int((~valid).sum())
