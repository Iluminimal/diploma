"""Recall sanity check: every product's own image, sent through the real query pipeline,
must come back as rank 1 of the pgvector search.

    cd apps/api && uv run python ../../scripts/check_recall.py --n 500

Near-duplicate catalogue images can tie with the product itself, so a hit is "self is rank 1,
or ties rank 1 within --tie-tolerance". Strict and tie-aware rates are both reported, along
with HNSW recall@k against an exact scan for the same queries.
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from sqlalchemy.ext.asyncio import async_sessionmaker

from angel.core.config import get_settings
from angel.db.engine import create_engine
from angel.ml.evaluation import exact_top_k, sample_products
from angel.ml.fashion_clip import FashionClipEmbedder, select_device
from angel.ml.preprocess import load_image
from angel.repositories.catalog.products import DEFAULT_EF_SEARCH, ProductRepository


async def main_async(args: argparse.Namespace) -> int:
    settings = get_settings()
    dataset = (args.dataset or settings.dataset_dir or Path()).expanduser()
    engine = create_engine(settings.database_url)
    embedder = FashionClipEmbedder(
        device=select_device(args.device), fp16=args.fp16, resize_mode=args.resize_mode
    )
    embedder.load()

    sessions = async_sessionmaker(engine, expire_on_commit=False)
    sample = await sample_products(engine, args.n, args.seed)
    strict = tolerant = top5 = 0
    overlap_total = 0.0
    misses: list[str] = []
    ties = 0
    for start in range(0, len(sample), 32):
        chunk = sample[start : start + 32]
        # Re-read the file as bytes, exactly like an upload, and decode with the shared code.
        images = [
            load_image((dataset / "images" / f"{source_id}.jpg").read_bytes(), min_side=800)
            for _, source_id in chunk
        ]
        vectors = embedder.embed_images(images)
        for (product_id, source_id), vector in zip(chunk, vectors, strict=True):
            async with sessions() as session, session.begin():
                hits = await ProductRepository(session).search_similar(
                    vector, limit=args.k, ef_search=args.ef_search
                )
                truth = await exact_top_k(session, vector, args.k)
            ids = [h.product.id for h in hits]
            overlap_total += len(set(ids) & set(truth)) / max(1, len(truth))
            top = hits[0].similarity
            tied = [h for h in hits if top - h.similarity <= args.tie_tolerance]
            strict += ids[0] == product_id
            top5 += product_id in ids[:5]
            is_tied_hit = product_id in {h.product.id for h in tied}
            tolerant += is_tied_hit
            ties += is_tied_hit and ids[0] != product_id
            if not is_tied_hit:
                own = next((h.similarity for h in hits if h.product.id == product_id), None)
                async with sessions() as session:
                    stored = await ProductRepository(session).get_embedding(product_id)
                assert stored is not None
                misses.append(
                    f"source {source_id}: top {hits[0].product.source_id} sim {top:.5f}, "
                    f"self {'not in top-k' if own is None else f'{own:.5f}'}; "
                    f"cos(query, stored self) = {float(vector @ stored):.6f}; "
                    f"exact scan has self at rank 1: {truth[0] == product_id}"
                )
    n = len(sample)
    print(
        f"queries: {n}  (ef_search={args.ef_search}, k={args.k}, "
        f"device={embedder.device}, version={embedder.version})"
    )
    print(f"rank-1 is self, strict:         {strict}/{n} = {strict / n:.4f}")
    print(
        f"rank-1 is self or tied (<= {args.tie_tolerance}): {tolerant}/{n} = {tolerant / n:.4f}"
        f"   ({ties} tied with a near-duplicate)"
    )
    print(f"self within top-5:              {top5}/{n} = {top5 / n:.4f}")
    print(f"HNSW recall@{args.k} vs exact scan:  {overlap_total / n:.4f}")
    for line in misses[:20]:
        print(f"  MISS {line}")
    await engine.dispose()
    return 0 if tolerant / n >= args.min_rate else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--n", type=int, default=500)
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument("--ef-search", type=int, default=DEFAULT_EF_SEARCH)
    parser.add_argument("--tie-tolerance", type=float, default=1e-4)
    parser.add_argument("--min-rate", type=float, default=0.99, help="exit 1 below this rate")
    parser.add_argument("--device", choices=["auto", "mps", "cpu", "cuda"], default="auto")
    parser.add_argument("--fp16", action="store_true")
    parser.add_argument(
        "--resize-mode", choices=["crop", "pad"], default=get_settings().embedding_resize_mode
    )
    return asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
