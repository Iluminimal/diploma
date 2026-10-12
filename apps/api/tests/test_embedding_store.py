from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from angel.ingestion import embedding_store
from angel.ingestion.embedding_store import EmbeddingStoreError

VERSION = "fake@test/pad"


def _unit(rows: int, seed: int = 0) -> np.ndarray:
    vectors = np.random.default_rng(seed).standard_normal((rows, 512)).astype(np.float32)
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def test_round_trip_across_shards(tmp_path: Path) -> None:
    first, second = _unit(3, 1), _unit(2, 2)
    embedding_store.write_shard(
        tmp_path, np.array([5, 3, 9]), first, version=VERSION, dtype="float32"
    )
    embedding_store.write_shard(
        tmp_path, np.array([1, 2]), second, version=VERSION, dtype="float32"
    )

    index = embedding_store.load_index(tmp_path, VERSION)

    assert sorted(index) == [1, 2, 3, 5, 9]
    np.testing.assert_allclose(index[3], first[1])
    np.testing.assert_allclose(index[2], second[1])
    assert embedding_store.existing_ids(tmp_path, VERSION) == {1, 2, 3, 5, 9}


def test_shards_from_another_model_or_preprocessing_are_refused(tmp_path: Path) -> None:
    embedding_store.write_shard(
        tmp_path, np.array([1]), _unit(1), version="other/crop", dtype="float32"
    )
    with pytest.raises(EmbeddingStoreError, match="does not match"):
        embedding_store.load_index(tmp_path, VERSION)


def test_unnormalised_or_non_finite_vectors_are_refused(tmp_path: Path) -> None:
    embedding_store.write_shard(
        tmp_path, np.array([1]), _unit(1) * 3, version=VERSION, dtype="float32"
    )
    with pytest.raises(EmbeddingStoreError, match="L2-normalized"):
        embedding_store.load_index(tmp_path, VERSION)

    bad = tmp_path / "nan"
    vectors = _unit(1)
    vectors[0, 0] = np.nan
    embedding_store.write_shard(bad, np.array([1]), vectors, version=VERSION, dtype="float32")
    with pytest.raises(EmbeddingStoreError, match="NaN"):
        embedding_store.load_index(bad, VERSION)


def test_wrong_shape_is_refused_at_write_time(tmp_path: Path) -> None:
    with pytest.raises(EmbeddingStoreError, match="shape"):
        embedding_store.write_shard(
            tmp_path,
            np.array([1]),
            np.zeros((1, 384), np.float32),
            version=VERSION,
            dtype="float32",
        )


def test_empty_directory_and_corrupt_shard(tmp_path: Path) -> None:
    assert embedding_store.existing_ids(tmp_path / "missing", VERSION) == set()
    with pytest.raises(EmbeddingStoreError, match="no embeddings"):
        embedding_store.load_index(tmp_path, VERSION)
    (tmp_path / "embeddings-00000.parquet").write_bytes(b"not parquet")
    with pytest.raises(EmbeddingStoreError, match="unreadable"):
        embedding_store.load_index(tmp_path, VERSION)


def test_unexpected_columns_are_refused(tmp_path: Path) -> None:
    table = pa.table({"id": [1]}).replace_schema_metadata({"embedding_version": VERSION})
    pq.write_table(table, tmp_path / "embeddings-00000.parquet")
    with pytest.raises(EmbeddingStoreError, match="unexpected columns"):
        embedding_store.load_index(tmp_path, VERSION)
