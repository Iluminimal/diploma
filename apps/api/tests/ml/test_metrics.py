import numpy as np
import pytest

from angel.ml import metrics


def rel(*rows: list[int]) -> metrics.Relevance:
    return np.array(rows, dtype=bool)


def counts(*values: int) -> metrics.Counts:
    return np.array(values, dtype=np.int64)


class TestAveragePrecision:
    def test_worked_example(self) -> None:
        # relevant at ranks 1 and 3 of 4: P@1 = 1, P@3 = 2/3.
        relevance = rel([1, 0, 1, 0])

        by_best = metrics.average_precision(relevance, counts(10), 4)
        by_retrieved = metrics.average_precision(relevance, counts(10), 4, normalise="retrieved")

        assert by_best[0] == pytest.approx((1 + 2 / 3) / 4)
        assert by_retrieved[0] == pytest.approx((1 + 2 / 3) / 2)

    def test_everything_relevant_is_one(self) -> None:
        assert metrics.average_precision(rel([1, 1, 1]), counts(5), 3)[0] == pytest.approx(1.0)

    def test_nothing_relevant_is_zero(self) -> None:
        relevance = rel([0, 0, 0])
        assert metrics.average_precision(relevance, counts(5), 3)[0] == 0.0
        assert metrics.average_precision(relevance, counts(5), 3, normalise="retrieved")[0] == 0.0

    def test_a_relevant_product_found_earlier_scores_higher(self) -> None:
        early = metrics.average_precision(rel([1, 0, 0]), counts(3), 3)[0]
        late = metrics.average_precision(rel([0, 0, 1]), counts(3), 3)[0]
        assert early > late

    def test_few_relevant_products_exist_so_finding_them_all_is_perfect(self) -> None:
        # Only two relevant products exist; both at the top of K=5 is a perfect result.
        scores = metrics.average_precision(rel([1, 1, 0, 0, 0]), counts(2), 5)
        assert scores[0] == pytest.approx(1.0)

    def test_a_query_with_no_relevant_product_in_the_catalogue_is_undefined(self) -> None:
        scores = metrics.average_precision(rel([0, 0], [1, 0]), counts(0, 4), 2)
        assert np.isnan(scores[0])
        assert not np.isnan(scores[1])

    def test_k_beyond_what_was_retrieved_is_refused(self) -> None:
        with pytest.raises(ValueError, match="k=5"):
            metrics.average_precision(rel([1, 0, 1]), counts(3), 5)


class TestOtherMetrics:
    def test_precision_recall_and_hit_rate(self) -> None:
        relevance = rel([1, 0, 1, 0], [0, 0, 0, 0])
        total = counts(4, 4)

        assert metrics.precision_at_k(relevance, total, 4).tolist() == [0.5, 0.0]
        assert metrics.recall_at_k(relevance, total, 4).tolist() == [0.5, 0.0]
        assert metrics.hit_rate_at_k(relevance, total, 4).tolist() == [1.0, 0.0]

    def test_ndcg_is_one_for_a_perfect_ranking_and_less_when_the_hit_is_late(self) -> None:
        perfect = metrics.ndcg_at_k(rel([1, 1, 0]), counts(2), 3)[0]
        late = metrics.ndcg_at_k(rel([0, 0, 1]), counts(2), 3)[0]
        assert perfect == pytest.approx(1.0)
        assert late == pytest.approx((1 / np.log2(4)) / (1 + 1 / np.log2(3)))

    def test_mean_valid_skips_undefined_queries_and_counts_them(self) -> None:
        mean, skipped = metrics.mean_valid(np.array([1.0, np.nan, 0.5]))
        assert mean == pytest.approx(0.75)
        assert skipped == 1


class TestLabels:
    def test_the_same_combination_gets_the_same_code(self) -> None:
        codes = metrics.encode_labels(["Shirts", "Shirts", "Shoes"], ["Blue", "Blue", "Blue"])
        assert codes[0] == codes[1] != codes[2]

    def test_a_missing_label_matches_nothing_not_even_another_missing_one(self) -> None:
        codes = metrics.encode_labels(["Shirts", "Shirts", "Shirts"], ["Blue", None, None])

        assert len({int(c) for c in codes}) == 3
        assert metrics.relevant_counts(codes).tolist() == [0, 0, 0]

    def test_the_relevant_count_leaves_the_query_itself_out(self) -> None:
        codes = metrics.encode_labels(["A", "A", "A", "B"])
        assert metrics.relevant_counts(codes).tolist() == [2, 2, 2, 0]

    def test_relevance_at_ranks(self) -> None:
        codes = metrics.encode_labels(["A", "B", "A", "A"])
        ranked = np.array([[2, 1, 3]], dtype=np.int64)

        relevance = metrics.relevance_at_ranks(codes, np.array([0], dtype=np.int64), ranked)

        assert relevance.tolist() == [[True, False, True]]
