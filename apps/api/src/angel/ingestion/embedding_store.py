"""Embedding export/import as parquet shards, so the heavy step can run on Colab/Kaggle.

A directory holds `embeddings-00000.parquet`, `embeddings-00001.parquet`, ... Each shard has
`source_id` (int64) and `embedding` (fixed-size list of 512 float32) plus file metadata that
says what produced the vectors. Import refuses shards from a different model/preprocessing.
"""

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from numpy.typing import NDArray

from angel.ml.fashion_clip import DIMENSION

SHARD_GLOB = "embeddings-*.parquet"
_META_VERSION = b"embedding_version"
_META_DTYPE = b"dtype"
_SCHEMA = pa.schema(
    [
        pa.field("source_id", pa.int64(), nullable=False),
        pa.field("embedding", pa.list_(pa.float32(), DIMENSION), nullable=False),
    ]
)


class EmbeddingStoreError(RuntimeError):
    pass


@dataclass(frozen=True)
class EmbeddingBatch:
    source_ids: NDArray[np.int64]
    vectors: NDArray[np.float32]


def _shards(directory: Path) -> list[Path]:
    return sorted(directory.glob(SHARD_GLOB))


def _read_shard(path: Path, expected_version: str) -> EmbeddingBatch:
    try:
        table = pq.read_table(path)
    except (pa.ArrowException, OSError) as exc:
        raise EmbeddingStoreError(f"{path.name}: unreadable parquet shard ({exc})") from exc
    metadata = table.schema.metadata or {}
    version = metadata.get(_META_VERSION, b"").decode()
    if version != expected_version:
        raise EmbeddingStoreError(
            f"{path.name}: embedding_version {version!r} does not match {expected_version!r}"
        )
    if table.schema.names != _SCHEMA.names:
        raise EmbeddingStoreError(f"{path.name}: unexpected columns {table.schema.names}")
    ids = table.column("source_id").to_numpy().astype(np.int64)
    rows = list(table.column("embedding").to_numpy(zero_copy_only=False))
    vectors = (
        np.asarray(np.stack(rows), dtype=np.float32)
        if rows
        else np.zeros((0, DIMENSION), np.float32)
    )
    if vectors.shape != (len(ids), DIMENSION):
        raise EmbeddingStoreError(f"{path.name}: unexpected embedding shape {vectors.shape}")
    if not np.isfinite(vectors).all():
        raise EmbeddingStoreError(f"{path.name}: contains NaN or infinite values")
    if len(ids) and not np.allclose(np.linalg.norm(vectors, axis=1), 1.0, atol=1e-3):
        raise EmbeddingStoreError(f"{path.name}: embeddings are not L2-normalized")
    return EmbeddingBatch(ids, vectors)


def write_shard(
    directory: Path,
    source_ids: NDArray[np.int64],
    vectors: NDArray[np.float32],
    *,
    version: str,
    dtype: str,
) -> Path:
    """Write the next shard atomically (temp file + rename), so a crash never leaves a
    truncated shard that a resumed run would trust."""
    directory.mkdir(parents=True, exist_ok=True)
    if vectors.shape != (len(source_ids), DIMENSION):
        raise EmbeddingStoreError(f"bad embedding shape {vectors.shape}")
    table = pa.table(
        {
            "source_id": pa.array(source_ids, type=pa.int64()),
            "embedding": pa.FixedSizeListArray.from_arrays(
                pa.array(vectors.reshape(-1), type=pa.float32()), DIMENSION
            ),
        },
        schema=_SCHEMA.with_metadata(
            {_META_VERSION: version.encode(), _META_DTYPE: dtype.encode()}
        ),
    )
    path = directory / f"embeddings-{len(_shards(directory)):05d}.parquet"
    temp = path.with_suffix(".parquet.tmp")
    pq.write_table(table, temp)
    temp.replace(path)
    return path


def read_all(directory: Path, expected_version: str) -> Iterator[EmbeddingBatch]:
    shards = _shards(directory)
    if not shards:
        raise EmbeddingStoreError(f"no {SHARD_GLOB} files in {directory}")
    for shard in shards:
        yield _read_shard(shard, expected_version)


def load_index(directory: Path, expected_version: str) -> dict[int, NDArray[np.float32]]:
    """All embeddings by source id (~90 MB for 44k products). Later shards win on duplicates."""
    index: dict[int, NDArray[np.float32]] = {}
    for batch in read_all(directory, expected_version):
        for source_id, vector in zip(batch.source_ids.tolist(), batch.vectors, strict=True):
            index[source_id] = vector
    return index


def existing_ids(directory: Path, expected_version: str) -> set[int]:
    if not directory.exists() or not _shards(directory):
        return set()
    return {int(i) for batch in read_all(directory, expected_version) for i in batch.source_ids}
