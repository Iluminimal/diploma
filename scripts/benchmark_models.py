"""Embedding загваруудыг (FashionCLIP, Marqo-FashionSigLIP, ResNet-50) офлайнаар харьцуулах.

    cd apps/api && uv run --group bench python ../../scripts/benchmark_models.py --limit 2000
    cd apps/api && uv run --group bench python ../../scripts/benchmark_models.py \\
        --out ../../docs/perf/models.json          # бүх каталог, анх удаа удаан (кэшлэдэг)

Загвар бүр каталогийн ЯГ ИЖИЛ 224x224 оролтыг авч (`to_clip_array`), өөрийн embedding гаргана.
Query нь каталогийн нэг бүтээгдэхүүн, хайлт нь exact (HNSW-гүй, cosine), query өөрийгөө
оруулахгүй. Relevant гэдэг нь label таарах (article type / + colour / + gender). Үр дүнд:
mAP, P, recall, hit rate, nDCG; encode-ийн хурд; параметрийн тоо; reference загвартай харьцуулсан
paired-bootstrap итгэлийн завсар. Ажиллаж буй сервисэд (DB, pgvector) хүрэхгүй.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch

from angel.core.config import get_settings
from angel.ingestion.cleaning import load_catalog
from angel.ml.benchmark.encoders import ENCODERS, build_encoder
from angel.ml.benchmark.report import render_latex, render_markdown
from angel.ml.benchmark.retrieval import (
    LEVELS,
    RELEVANCE,
    build_codes,
    exact_neighbours,
    paired_bootstrap,
    per_query_ap,
    random_neighbours,
    score,
)
from angel.ml.benchmark.runner import embed_catalogue, load_array, measure_latency
from angel.ml.fashion_clip import select_device

DEFAULT_MODELS = "fashion-clip,marqo-fashion-siglip,resnet50-imagenet"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--models", default=DEFAULT_MODELS, help=f"from {sorted(ENCODERS)}")
    parser.add_argument("--reference", default="fashion-clip", help="significance baseline")
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument(
        "--limit", type=int, default=0, help="random subset of the catalogue; 0 = everything"
    )
    parser.add_argument("--n", type=int, default=0, help="queries; 0 = every product")
    parser.add_argument("--ks", default="5,10,20")
    parser.add_argument("--k-report", type=int, default=10, help="K for the tables and bootstrap")
    parser.add_argument("--resize-mode", default="pad", choices=["pad", "crop"])
    parser.add_argument("--device", default="auto", choices=["auto", "mps", "cpu", "cuda"])
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--bootstrap", type=int, default=2000, help="resamples")
    parser.add_argument("--cache", type=Path, default=Path("../../docs/perf/embeddings"))
    parser.add_argument("--out", type=Path, default=None, help="JSON; .md and .tex written beside")
    args = parser.parse_args()

    names = [name.strip() for name in args.models.split(",") if name.strip()]
    if args.reference not in names:
        parser.error(f"--reference {args.reference!r} must be one of --models")
    ks = sorted({int(k) for k in args.ks.split(",")} | {args.k_report})
    device = select_device(args.device)

    dataset = (args.dataset or get_settings().dataset_dir or Path()).expanduser()
    products, _ = load_catalog(dataset / "styles.csv", dataset / "images")
    rng = np.random.default_rng(args.seed)
    if args.limit and args.limit < len(products):
        keep = np.sort(rng.choice(len(products), args.limit, replace=False))
        products = [products[i] for i in keep]
    paths = [p.image_path for p in products]
    codes = build_codes(
        [p.article_type for p in products],
        [p.base_colour for p in products],
        [p.gender for p in products],
    )
    size = len(products)
    queries = (
        np.arange(size, dtype=np.int64)
        if not args.n or args.n >= size
        else np.sort(rng.choice(size, args.n, replace=False)).astype(np.int64)
    )
    print(f"{size} products, {len(queries)} queries, device={device}, input={args.resize_mode}")

    probe = np.stack([load_array(path, args.resize_mode) for path in paths[:32]])
    models: dict[str, Any] = {}
    average_precision: dict[str, dict[str, Any]] = {}
    for name in names:
        encoder = build_encoder(name, device)
        encoder.load()
        embeddings = embed_catalogue(
            encoder,
            paths,
            mode=args.resize_mode,
            root=args.cache,
            batch_size=args.batch_size,
            workers=args.workers,
        )
        latency = measure_latency(encoder, probe)
        ranked = exact_neighbours(embeddings, queries, max(ks))
        models[name] = {
            "version": encoder.version,
            "dimension": encoder.dimension,
            "vision_params_m": round(encoder.parameters() / 1e6, 2),
            "catalogue_embeddings_mb": round(embeddings.nbytes / 1e6, 1),
            "latency": latency,
            "metrics": score(codes, queries, ranked, ks),
        }
        average_precision[name] = {
            level: per_query_ap(codes, queries, ranked, level, args.k_report) for level in LEVELS
        }
        encoder.close()
        if device.type == "mps":
            torch.mps.empty_cache()

    baseline = score(codes, queries, random_neighbours(size, queries, max(ks), args.seed), ks)
    significance = {
        name: {
            level: paired_bootstrap(
                average_precision[args.reference][level],
                average_precision[name][level],
                resamples=args.bootstrap,
                seed=args.seed,
            )
            for level in LEVELS
        }
        for name in names
        if name != args.reference
    }
    report: dict[str, Any] = {
        "config": {
            "catalogue_size": size,
            "queries": len(queries),
            "ks": ks,
            "k_report": args.k_report,
            "input": f"{args.resize_mode} (same 224x224 uint8 array for every model)",
            "device": str(device),
            "seed": args.seed,
            "reference": args.reference,
            "relevance": RELEVANCE,
            "search": "exact cosine (no ANN index), query product excluded",
        },
        "models": models,
        "random_baseline": baseline,
        "significance": significance,
    }
    markdown = render_markdown(report, args.k_report)
    print("\n" + markdown)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2) + "\n")
        args.out.with_suffix(".md").write_text(markdown)
        args.out.with_suffix(".tex").write_text(render_latex(report, args.k_report))
        print(f"written {args.out} (+ .md, .tex)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
