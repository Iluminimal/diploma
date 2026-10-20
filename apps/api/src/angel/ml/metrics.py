"""Retrieval metrics for judging the visual search: P@K, recall@K, hit rate, nDCG@K and (mean)
average precision.

Every function takes a *relevance matrix*: one row per query, one column per rank, `True` where the
product returned at that rank is relevant to the query. Queries that have no relevant product in the
catalogue at all (`total_relevant == 0`) have no defined score and come back as `nan`; `mean_valid`
averages over the others and says how many it skipped.

Average precision for one query is `sum over ranks i <= K of P@i * rel_i`, divided by the number
of relevant products it could at best have found in K (`min(K, R)`, the default) or, in the other
common convention, by how many it did find. The mean over all queries is the mAP.
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
    """One integer per row for the combination of the label columns.

    A row with a missing label in any column gets a code of its own, negative and unique, so it
    never counts as relevant to anything (not even another row with a missing label).
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
    """For each row, how many *other* rows share its code: what a query by that row can find."""
    counts = np.zeros(len(codes), dtype=np.int64)
    labelled = codes >= 0
    if labelled.any():
        sizes = np.bincount(codes[labelled])
        counts[labelled] = sizes[codes[labelled]] - 1
    return counts


def relevance_at_ranks(
    codes: NDArray[np.int64], query_rows: NDArray[np.int64], ranked_rows: NDArray[np.int64]
) -> Relevance:
    """`ranked_rows[q, r]` is the catalogue row returned at rank r for query q: is it relevant?"""
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
    """Share of the top K that is relevant."""
    return _defined(total_relevant, _top(relevance, k).sum(axis=1) / k)


def recall_at_k(relevance: Relevance, total_relevant: Counts, k: int) -> Scores:
    """Share of all the relevant products that is in the top K."""
    hits = _top(relevance, k).sum(axis=1)
    return _defined(total_relevant, hits / np.maximum(total_relevant, 1))


def hit_rate_at_k(relevance: Relevance, total_relevant: Counts, k: int) -> Scores:
    """1 when at least one of the top K is relevant, else 0."""
    return _defined(total_relevant, (_top(relevance, k).sum(axis=1) > 0).astype(np.float64))


def average_precision(
    relevance: Relevance, total_relevant: Counts, k: int, normalise: Normalise = "min_k_r"
) -> Scores:
    """AP@K per query (see the module docstring for the two normalisations)."""
    top = _top(relevance, k)
    hits = np.cumsum(top, axis=1)
    precision = hits / np.arange(1, k + 1)
    gained = (precision * top).sum(axis=1)
    best = np.minimum(k, total_relevant) if normalise == "min_k_r" else hits[:, -1]
    scores = np.where(best > 0, gained / np.maximum(best, 1), 0.0)
    return _defined(total_relevant, scores)


def ndcg_at_k(relevance: Relevance, total_relevant: Counts, k: int) -> Scores:
    """Binary-gain nDCG@K: relevant products near the top count more (1 / log2(rank + 1))."""
    top = _top(relevance, k)
    discount = 1.0 / np.log2(np.arange(2, k + 2))
    ideal = np.concatenate([[0.0], np.cumsum(discount)])[np.minimum(k, total_relevant)]
    gained = (top * discount).sum(axis=1)
    return _defined(total_relevant, gained / np.maximum(ideal, 1e-12))


def mean_valid(scores: Scores) -> tuple[float, int]:
    """The mean over the queries that have a score, and how many had none (and were skipped)."""
    valid = ~np.isnan(scores)
    if not valid.any():
        return float("nan"), len(scores)
    return float(scores[valid].mean()), int((~valid).sum())
