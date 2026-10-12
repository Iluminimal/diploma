"""Ingestion pipeline: clean products -> thumbnails + embeddings -> bulk upsert.

The database is the only state. A product is "done" when its row exists with the current
`embedding_version` and both thumbnails exist, so a killed run resumes at the next batch and a
finished run is a no-op.
"""

from __future__ import annotations

import multiprocessing
from collections.abc import Callable, Iterator, Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from angel.core.slug import slugify
from angel.ingestion import embedding_store
from angel.ingestion.cleaning import CleanProduct
from angel.ingestion.images import (
    THUMBNAIL_SIZES,
    ImageJob,
    ImageResult,
    image_key,
    process_image,
    thumbnail_key,
)
from angel.ingestion.pricing import CURRENCY, DEFAULT_SEED, generate_price_and_stock
from angel.ml.embeddings import EmbeddingService
from angel.ml.preprocess import ResizeMode
from angel.models import Category, Product
from angel.storage import Storage

Progress = Callable[[int], object]


@dataclass(frozen=True)
class IngestOptions:
    batch_size: int = 64
    # 0 = decode in-process (tests, tiny runs). Otherwise number of worker processes.
    workers: int = 3
    resize_mode: ResizeMode = "pad"
    reembed: bool = False
    regenerate_thumbnails: bool = False
    seed: int = DEFAULT_SEED


@dataclass
class IngestStats:
    considered: int = 0
    skipped: int = 0
    upserted: int = 0
    thumbnails_written: int = 0
    failed: dict[int, str] = field(default_factory=dict)


@dataclass(frozen=True)
class WorkItem:
    product: CleanProduct
    needs_embedding: bool
    needs_thumbnails: bool


def plan_work(
    products: Sequence[CleanProduct],
    existing_versions: dict[int, str],
    storage: Storage,
    *,
    version: str,
    reembed: bool = False,
    regenerate_thumbnails: bool = False,
) -> list[WorkItem]:
    """Decide, per product, what is still missing. Pure apart from `storage.exists`."""
    work: list[WorkItem] = []
    for product in products:
        needs_embedding = reembed or existing_versions.get(product.source_id) != version
        base = image_key(product.source_id)
        needs_thumbnails = regenerate_thumbnails or not all(
            storage.exists(thumbnail_key(base, size)) for size in THUMBNAIL_SIZES
        )
        if needs_embedding or needs_thumbnails:
            work.append(WorkItem(product, needs_embedding, needs_thumbnails))
    return work


# --- running image jobs ----------------------------------------------------------------------

_worker_storage: Storage | None = None


def _init_worker(storage: Storage) -> None:
    global _worker_storage
    _worker_storage = storage


def _run_job(job: ImageJob) -> ImageResult:
    assert _worker_storage is not None
    return process_image(job, _worker_storage)


def iter_results(
    jobs: Sequence[ImageJob], *, batch_size: int, workers: int, storage: Storage
) -> Iterator[list[ImageResult]]:
    """Yield results batch by batch, in order.

    With worker processes, the next batch is already being decoded while the caller embeds and
    writes the current one. At most two batches of pixel arrays exist at once (8 GB machine).
    """
    batches = [jobs[i : i + batch_size] for i in range(0, len(jobs), batch_size)]
    if workers == 0:
        for batch in batches:
            yield [process_image(job, storage) for job in batch]
        return
    # `spawn`, never `fork`: the parent already holds torch/MPS state, which must not be forked.
    executor = ProcessPoolExecutor(
        workers,
        mp_context=multiprocessing.get_context("spawn"),
        initializer=_init_worker,
        initargs=(storage,),
    )
    try:
        # `map` submits every task immediately; only the results are consumed lazily.
        current = executor.map(_run_job, batches[0], chunksize=4) if batches else iter(())
        for index in range(len(batches)):
            upcoming = (
                executor.map(_run_job, batches[index + 1], chunksize=4)
                if index + 1 < len(batches)
                else iter(())
            )
            yield list(current)
            current = upcoming
    finally:
        executor.shutdown(wait=True, cancel_futures=True)


# --- categories ------------------------------------------------------------------------------

CategoryKey = tuple[str, str, str]  # (master, sub, article type)


async def ensure_categories(
    connection: AsyncConnection, products: Sequence[CleanProduct]
) -> dict[CategoryKey, int]:
    """Upsert the master > sub > article-type tree; return the leaf id per category triple."""
    nodes: dict[str, tuple[str | None, int, str]] = {}  # path -> (parent path, level, name)
    leaf_paths: dict[CategoryKey, str] = {}
    for p in products:
        names = (p.master_category, p.sub_category, p.article_type)
        parent: str | None = None
        path = ""
        for level, name in enumerate(names, start=1):
            slug = slugify(name) or f"category-{level}"
            path = slug if parent is None else f"{parent}/{slug}"
            known = nodes.setdefault(path, (parent, level, name))
            if known[2] != name:
                raise ValueError(f"categories {known[2]!r} and {name!r} share the slug {path!r}")
            parent = path
        leaf_paths[(p.master_category, p.sub_category, p.article_type)] = path

    ids: dict[str, int] = {}
    for path, (parent_path, level, name) in sorted(nodes.items(), key=lambda kv: kv[1][1]):
        statement = (
            insert(Category)
            .values(
                parent_id=ids[parent_path] if parent_path else None,
                level=level,
                name=name,
                slug=path.rsplit("/", 1)[-1],
                path=path,
            )
            .on_conflict_do_update(
                index_elements=[Category.path],
                set_={"name": name, "parent_id": ids[parent_path] if parent_path else None},
            )
            .returning(Category.id)
        )
        ids[path] = (await connection.execute(statement)).scalar_one()
    return {key: ids[path] for key, path in leaf_paths.items()}


# --- the run ---------------------------------------------------------------------------------


def build_row(
    product: CleanProduct,
    *,
    category_id: int,
    blur_data_url: str | None,
    embedding: NDArray[np.float32],
    version: str,
    seed: int,
) -> dict[str, object]:
    price_cents, stock = generate_price_and_stock(
        product.source_id,
        article_type=product.article_type,
        sub_category=product.sub_category,
        master_category=product.master_category,
        seed=seed,
    )
    slug_base = slugify(product.name) or "product"
    return {
        "source_id": product.source_id,
        "slug": f"{slug_base}-{product.source_id}",
        "name": product.name,
        "category_id": category_id,
        "gender": product.gender,
        "master_category": product.master_category,
        "sub_category": product.sub_category,
        "article_type": product.article_type,
        "base_colour": product.base_colour,
        "season": product.season,
        "usage": product.usage,
        "year": product.year,
        "price_cents": price_cents,
        "currency": CURRENCY,
        "stock_quantity": stock,
        "is_active": True,
        "image_key": image_key(product.source_id),
        "blur_data_url": blur_data_url,
        "embedding": embedding,
        "embedding_version": version,
    }


async def _upsert(connection: AsyncConnection, rows: list[dict[str, object]]) -> None:
    statement = insert(Product).values(rows)
    # Re-ingesting refreshes catalogue data and the embedding but keeps what the shop owns:
    # id, created_at and (after Phase 4) live stock and activity changes.
    refreshed: dict[str, Any] = {
        column: statement.excluded[column]
        for column in rows[0]
        if column not in {"source_id", "stock_quantity", "is_active", "price_cents", "currency"}
    }
    refreshed["updated_at"] = func.now()
    await connection.execute(
        statement.on_conflict_do_update(index_elements=[Product.source_id], set_=refreshed)
    )


async def ingest_products(
    engine: AsyncEngine,
    products: Sequence[CleanProduct],
    storage: Storage,
    *,
    version: str,
    options: IngestOptions,
    embedder: EmbeddingService | None = None,
    imported: dict[int, NDArray[np.float32]] | None = None,
    on_progress: Progress | None = None,
) -> IngestStats:
    """Embed (or import embeddings for), thumbnail and upsert `products`. Safe to re-run."""
    if (embedder is None) == (imported is None):
        raise ValueError("pass exactly one of `embedder` or `imported`")
    stats = IngestStats(considered=len(products))

    async with engine.begin() as connection:
        category_ids = await ensure_categories(connection, products)
        rows = await connection.execute(select(Product.source_id, Product.embedding_version))
        existing = {source_id: ver for source_id, ver in rows.all() if source_id is not None}

    work = plan_work(
        products,
        existing,
        storage,
        version=version,
        reembed=options.reembed,
        regenerate_thumbnails=options.regenerate_thumbnails,
    )
    stats.skipped = len(products) - len(work)
    if on_progress:
        on_progress(stats.skipped)

    jobs = [
        ImageJob(
            item.product.source_id,
            item.product.image_path,
            options.resize_mode,
            write_thumbnails=item.needs_thumbnails,
            compute_array=item.needs_embedding and embedder is not None,
        )
        for item in work
    ]
    by_id = {item.product.source_id: item for item in work}

    batches = iter_results(
        jobs, batch_size=options.batch_size, workers=options.workers, storage=storage
    )
    for results in batches:
        rows_to_write: list[dict[str, object]] = []
        embeddable: list[ImageResult] = []
        for result in results:
            if result.error is not None:
                stats.failed[result.source_id] = result.error
                continue
            item = by_id[result.source_id]
            if item.needs_thumbnails:
                stats.thumbnails_written += 1
            if not item.needs_embedding:
                continue
            if imported is not None:
                vector = imported.get(result.source_id)
                if vector is None:
                    stats.failed[result.source_id] = "no imported embedding for this product"
                    continue
                rows_to_write.append(_row(item, result, category_ids, vector, version, options))
            else:
                embeddable.append(result)

        if embeddable:
            assert embedder is not None
            arrays = np.stack([r.clip_array for r in embeddable if r.clip_array is not None])
            vectors = embedder.embed_arrays(arrays)
            for result, vector in zip(embeddable, vectors, strict=True):
                rows_to_write.append(
                    _row(by_id[result.source_id], result, category_ids, vector, version, options)
                )

        if rows_to_write:
            async with engine.begin() as connection:
                await _upsert(connection, rows_to_write)
            stats.upserted += len(rows_to_write)
        if on_progress:
            on_progress(len(results))
    return stats


def _row(
    item: WorkItem,
    result: ImageResult,
    category_ids: dict[CategoryKey, int],
    vector: NDArray[np.float32],
    version: str,
    options: IngestOptions,
) -> dict[str, object]:
    product = item.product
    return build_row(
        product,
        category_id=category_ids[
            (product.master_category, product.sub_category, product.article_type)
        ],
        blur_data_url=result.blur_data_url,
        embedding=vector,
        version=version,
        seed=options.seed,
    )


def export_embeddings(
    products: Sequence[CleanProduct],
    out_dir: Path,
    embedder: EmbeddingService,
    *,
    options: IngestOptions,
    dtype: str,
    shard_size: int = 2048,
    on_progress: Progress | None = None,
    storage: Storage,
) -> IngestStats:
    """Embed without a database and write resumable parquet shards (run this on Colab)."""
    done = embedding_store.existing_ids(out_dir, embedder.version)
    todo = [p for p in products if p.source_id not in done]
    stats = IngestStats(considered=len(products), skipped=len(products) - len(todo))
    if on_progress:
        on_progress(stats.skipped)
    jobs = [ImageJob(p.source_id, p.image_path, options.resize_mode, False, True) for p in todo]

    buffer_ids: list[int] = []
    buffer_vectors: list[NDArray[np.float32]] = []

    def flush() -> None:
        if buffer_ids:
            embedding_store.write_shard(
                out_dir,
                np.asarray(buffer_ids, dtype=np.int64),
                np.concatenate(buffer_vectors),
                version=embedder.version,
                dtype=dtype,
            )
            stats.upserted += len(buffer_ids)
            buffer_ids.clear()
            buffer_vectors.clear()

    for results in iter_results(
        jobs, batch_size=options.batch_size, workers=options.workers, storage=storage
    ):
        good = [r for r in results if r.error is None and r.clip_array is not None]
        for r in results:
            if r.error is not None:
                stats.failed[r.source_id] = r.error
        if good:
            vectors = embedder.embed_arrays(
                np.stack([r.clip_array for r in good if r.clip_array is not None])
            )
            buffer_ids.extend(r.source_id for r in good)
            buffer_vectors.append(vectors)
        if len(buffer_ids) >= shard_size:
            flush()
        if on_progress:
            on_progress(len(results))
    flush()
    return stats
