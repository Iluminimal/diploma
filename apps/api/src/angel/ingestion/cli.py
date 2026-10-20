"""Dataset ingestion-ы command line (`make ingest`, `scripts/ingest.py`)."""

import argparse
import asyncio
import sys
from pathlib import Path

from tqdm import tqdm

from angel.core.config import get_settings
from angel.db.engine import create_engine
from angel.ingestion import embedding_store
from angel.ingestion.cleaning import DEFAULT_MASTER_CATEGORIES, load_catalog
from angel.ingestion.pipeline import (
    IngestOptions,
    IngestStats,
    export_embeddings,
    ingest_products,
)
from angel.ml.fashion_clip import FashionClipEmbedder, embedding_version, select_device
from angel.storage import LocalStorage


def _common(parser: argparse.ArgumentParser) -> None:
    settings = get_settings()
    parser.add_argument(
        "--dataset",
        type=Path,
        default=settings.dataset_dir,
        help="folder with styles.csv and images/ (env DATASET_DIR)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="only the first N products by id (a later larger run is a superset)",
    )
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument(
        "--workers", type=int, default=3, help="image decoding processes (0 = in this process)"
    )
    parser.add_argument(
        "--device", choices=["auto", "mps", "cpu", "cuda"], default=settings.embedding_device
    )
    parser.add_argument(
        "--fp16", action=argparse.BooleanOptionalAction, default=settings.embedding_fp16
    )
    parser.add_argument(
        "--resize-mode", choices=["crop", "pad"], default=settings.embedding_resize_mode
    )
    parser.add_argument(
        "--master-categories",
        default=",".join(DEFAULT_MASTER_CATEGORIES),
        help="comma-separated masterCategory values to ingest",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ingest", description=__doc__)
    sub = parser.add_subparsers(dest="command")

    run = sub.add_parser("run", help="clean, thumbnail, embed and load into Postgres (default)")
    _common(run)
    run.add_argument(
        "--import-embeddings",
        type=Path,
        default=None,
        help="use embeddings exported by `embed` instead of running the model",
    )
    run.add_argument("--reembed", action="store_true", help="recompute embeddings that exist")
    run.add_argument("--regenerate-thumbnails", action="store_true")

    embed = sub.add_parser("embed", help="only compute embeddings into parquet shards (no DB)")
    _common(embed)
    embed.add_argument("--out", type=Path, required=True)
    return parser


def _load(args: argparse.Namespace) -> tuple[Path, list]:  # type: ignore[type-arg]
    if args.dataset is None:
        raise SystemExit("pass --dataset or set DATASET_DIR (folder with styles.csv and images/)")
    dataset = args.dataset.expanduser()
    categories = [c.strip() for c in args.master_categories.split(",") if c.strip()]
    products, report = load_catalog(
        dataset / "styles.csv", dataset / "images", master_categories=categories
    )
    print(report.render())
    if args.limit is not None:
        products = products[: args.limit]
        print(f"--limit {args.limit}: ingesting {len(products)} products")
    return dataset, products


def _embedder(args: argparse.Namespace) -> FashionClipEmbedder:
    embedder = FashionClipEmbedder(
        device=select_device(args.device), fp16=args.fp16, resize_mode=args.resize_mode
    )
    print(f"loading FashionCLIP on {embedder.device} ({'fp16' if args.fp16 else 'fp32'}) ...")
    embedder.load()
    return embedder


def _summary(stats: IngestStats) -> None:
    print(
        f"considered {stats.considered}: skipped (already done) {stats.skipped}, "
        f"written {stats.upserted}, thumbnails {stats.thumbnails_written}, "
        f"failed {len(stats.failed)}"
    )
    for source_id, reason in list(stats.failed.items())[:20]:
        print(f"  failed {source_id}: {reason}")
    if len(stats.failed) > 20:
        print(f"  ... and {len(stats.failed) - 20} more")


def _run(args: argparse.Namespace) -> int:
    settings = get_settings()
    _, products = _load(args)
    storage = LocalStorage(settings.media_dir, settings.media_base_url)
    options = IngestOptions(
        batch_size=args.batch_size,
        workers=args.workers,
        resize_mode=args.resize_mode,
        reembed=args.reembed,
        regenerate_thumbnails=args.regenerate_thumbnails,
    )
    version = embedding_version(args.resize_mode)
    imported = None
    embedder = None
    if args.import_embeddings is not None:
        imported = embedding_store.load_index(args.import_embeddings, version)
        print(f"imported {len(imported)} embeddings from {args.import_embeddings}")
    else:
        embedder = _embedder(args)
        version = embedder.version

    engine = create_engine(settings.database_url)

    async def go() -> IngestStats:
        try:
            with tqdm(total=len(products), unit="img", smoothing=0.05) as bar:
                return await ingest_products(
                    engine,
                    products,
                    storage,
                    version=version,
                    options=options,
                    embedder=embedder,
                    imported=imported,
                    on_progress=bar.update,
                )
        finally:
            await engine.dispose()

    _summary(asyncio.run(go()))
    return 0


def _embed(args: argparse.Namespace) -> int:
    settings = get_settings()
    _, products = _load(args)
    storage = LocalStorage(settings.media_dir, settings.media_base_url)
    options = IngestOptions(
        batch_size=args.batch_size, workers=args.workers, resize_mode=args.resize_mode
    )
    embedder = _embedder(args)
    with tqdm(total=len(products), unit="img", smoothing=0.05) as bar:
        stats = export_embeddings(
            products,
            args.out,
            embedder,
            options=options,
            dtype="float16" if args.fp16 else "float32",
            on_progress=bar.update,
            storage=storage,
        )
    _summary(stats)
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0].startswith("-"):
        argv = ["run", *argv]  # `run` нь default command
    args = build_parser().parse_args(argv)
    return _run(args) if args.command == "run" else _embed(args)
