"""Measure search latency against the ingested catalogue and compare with the spec targets
(image search p95 < ~400 ms on CPU, similar products p95 < 50 ms).

    cd apps/api && uv run python ../../scripts/measure_latency.py --device cpu
    cd apps/api && uv run python ../../scripts/measure_latency.py --device mps

Also sweeps hnsw.ef_search (recall@k vs an exact scan) and compares filtered search with and
without pgvector iterative scan, which backs the choices documented in docs/ml-pipeline.md.
"""

from __future__ import annotations

import argparse
import asyncio
import time
from pathlib import Path

import numpy as np
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from lookalike.core.config import get_settings
from lookalike.db.engine import create_engine
from lookalike.evaluation import (
    exact_top_k,
    format_percentiles,
    make_upload,
    ms_since,
    percentiles,
    sample_products,
)
from lookalike.ml.fashion_clip import FashionClipEmbedder, select_device
from lookalike.ml.preprocess import load_image, to_clip_array
from lookalike.models import Product
from lookalike.repositories.products import DEFAULT_EF_SEARCH, ProductRepository, SearchFilters

TARGET_IMAGE_P95_MS = 400.0
TARGET_SIMILAR_P95_MS = 50.0
WARMUP = 10


async def main_async(args: argparse.Namespace) -> int:
    settings = get_settings()
    dataset = (args.dataset or settings.dataset_dir or Path()).expanduser()
    engine: AsyncEngine = create_engine(settings.database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    embedder = FashionClipEmbedder(device=select_device(args.device), resize_mode=args.resize_mode)
    embedder.load()
    print(f"device={embedder.device} version={embedder.version} ef_search={args.ef_search}\n")

    sample = await sample_products(engine, args.n + WARMUP, args.seed)
    ok = True

    for label, side in (("original 1800x2400", None), ("phone-style 1280px", 1280)):
        uploads = [make_upload(dataset / "images" / f"{s}.jpg", side) for _, s in sample]
        decode, prep, embed, query, filtered, total = [], [], [], [], [], []
        for index, data in enumerate(uploads):
            t0 = time.perf_counter()
            image = load_image(data, min_side=800)
            t1 = time.perf_counter()
            to_clip_array(image, embedder.resize_mode)
            t2 = time.perf_counter()
            # The API path: inference on the embedder's worker thread, event loop stays free.
            vector = (await embedder.aembed_images([image]))[0]
            t3 = time.perf_counter()
            async with sessions() as session, session.begin():
                repo = ProductRepository(session)
                hits = await repo.search_similar(vector, limit=20, ef_search=args.ef_search)
            t4 = time.perf_counter()
            if index < WARMUP:
                continue
            decode.append((t1 - t0) * 1000)
            prep.append((t2 - t1) * 1000)
            embed.append((t3 - t2) * 1000)
            query.append((t4 - t3) * 1000)
            total.append((t4 - t0) * 1000)
            top = hits[0].product
            async with sessions() as session, session.begin():
                t5 = time.perf_counter()
                await ProductRepository(session).search_similar(
                    vector,
                    filters=SearchFilters(
                        genders=(top.gender,),
                        article_types=(top.article_type,),
                        in_stock_only=True,
                        min_price_cents=1000,
                        max_price_cents=15000,
                    ),
                    limit=20,
                    ef_search=args.ef_search,
                )
                filtered.append(ms_since(t5))
        print(f"== image search, upload = {label}, {args.n} requests")
        print(format_percentiles("decode (Pillow, draft)", decode))
        print(format_percentiles("224px resize/pad (extra, info)", prep))
        print(format_percentiles(f"embed batch=1 ({embedder.device})", embed))
        print(format_percentiles("pgvector top-20, unfiltered", query))
        print(format_percentiles("pgvector top-20, 5 filters", filtered))
        print(format_percentiles("END TO END image search", total))
        p95 = percentiles(total)["p95"]
        verdict = "PASS" if p95 < TARGET_IMAGE_P95_MS else "FAIL"
        print(f"   target p95 < {TARGET_IMAGE_P95_MS:.0f} ms: {verdict} ({p95:.0f} ms)\n")
        ok &= p95 < TARGET_IMAGE_P95_MS

    # Similar products from the stored embedding: no inference at all.
    similar = []
    for index, (product_id, _) in enumerate(sample):
        start = time.perf_counter()
        async with sessions() as session, session.begin():
            repo = ProductRepository(session)
            vector = await repo.get_embedding(product_id)
            assert vector is not None
            await repo.search_similar(
                vector, limit=12, exclude_id=product_id, ef_search=args.ef_search
            )
        if index >= WARMUP:
            similar.append(ms_since(start))
    print("== similar products (stored embedding, k=12)")
    print(format_percentiles("GET similar", similar))
    p95 = percentiles(similar)["p95"]
    print(
        f"   target p95 < {TARGET_SIMILAR_P95_MS:.0f} ms: "
        f"{'PASS' if p95 < TARGET_SIMILAR_P95_MS else 'FAIL'} ({p95:.0f} ms)\n"
    )
    ok &= p95 < TARGET_SIMILAR_P95_MS

    if not args.skip_sweep:
        await sweeps(engine, sessions, sample[WARMUP : WARMUP + args.sweep_n], args.k)
    await engine.dispose()
    return 0 if ok else 1


async def sweeps(engine, sessions, sample, k) -> None:  # type: ignore[no-untyped-def]
    print(f"== ef_search sweep: recall@{k} vs exact scan, {len(sample)} stored-embedding queries")
    queries = []
    async with sessions() as session:
        repo = ProductRepository(session)
        for product_id, _ in sample:
            vector = await repo.get_embedding(product_id)
            assert vector is not None
            queries.append((product_id, vector))
    truths = {}
    for product_id, vector in queries:
        async with sessions() as session, session.begin():
            truths[product_id] = [
                i for i in await exact_top_k(session, vector, k + 1) if i != product_id
            ][:k]
    for ef in (10, 20, 40, 80, 120, 200, 400):
        recalls, times = [], []
        for product_id, vector in queries:
            async with sessions() as session, session.begin():
                start = time.perf_counter()
                hits = await ProductRepository(session).search_similar(
                    vector, limit=k, ef_search=ef, exclude_id=product_id
                )
                times.append(ms_since(start))
            recalls.append(len({h.product.id for h in hits} & set(truths[product_id])) / k)
        print(
            f"   ef_search={ef:<4} recall@{k} {np.mean(recalls):.4f}   "
            f"p50 {np.percentile(times, 50):5.1f} ms  p95 {np.percentile(times, 95):5.1f} ms"
        )

    print("\n== filtered search (gender + article type + in stock): iterative scan on/off")
    for iterative in (False, True):
        recalls, returned, times = [], [], []
        for product_id, vector in queries:
            async with sessions() as session, session.begin():
                product = await session.get(Product, product_id)
                assert product is not None
                filters = SearchFilters(
                    genders=(product.gender,),
                    article_types=(product.article_type,),
                    in_stock_only=True,
                )
                truth = await exact_top_k(session, vector, k + 1, filters)
                truth = [i for i in truth if i != product_id][:k]
                start = time.perf_counter()
                hits = await ProductRepository(session).search_similar(
                    vector,
                    filters=filters,
                    limit=k,
                    exclude_id=product_id,
                    iterative_scan=iterative,
                )
                times.append(ms_since(start))
            returned.append(len(hits) / max(1, len(truth)))
            recalls.append(len({h.product.id for h in hits} & set(truth)) / max(1, len(truth)))
        print(
            f"   iterative_scan={'on ' if iterative else 'off'}  recall@{k} {np.mean(recalls):.4f}"
            f"   rows returned vs expected {np.mean(returned):.3f}"
            f"   p50 {np.percentile(times, 50):5.1f} ms  p95 {np.percentile(times, 95):5.1f} ms"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--n", type=int, default=200)
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--sweep-n", type=int, default=150)
    parser.add_argument("--seed", type=int, default=5)
    parser.add_argument("--ef-search", type=int, default=DEFAULT_EF_SEARCH)
    parser.add_argument("--device", choices=["auto", "mps", "cpu", "cuda"], default="cpu")
    parser.add_argument(
        "--resize-mode", choices=["crop", "pad"], default=get_settings().embedding_resize_mode
    )
    parser.add_argument("--skip-sweep", action="store_true")
    return asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
