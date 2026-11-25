"""Visual search-ийн хайлтын чанар: mean average precision (mAP) болон бусад metric.

    cd apps/api && uv run python ../../scripts/evaluate_map.py              # бүх каталог, exact
    cd apps/api && uv run python ../../scripts/evaluate_map.py --mode image  # жинхэнэ upload зам

Query нь каталогийн нэг бүтээгдэхүүн; хайлт түүнд хамгийн ойр бүтээгдэхүүнүүдийг буцаана (query
өөрийгөө оруулахгүй, эс бөгөөс үргэлж rank 1 болно). Буцсан бүтээгдэхүүн query-тэй ижил label-тэй
бол *relevant*. Kaggle dataset-ийн label-аас гурван түвшний хатуу байдал авна:

    category   ижил article type                       (Tshirts, Heels, ...)
    colour     ижил article type, base colour
    strict     ижил article type, base colour, gender

`--mode stored` (default) нь database-д байгаа embedding-ийг query болгож, матрицын үржвэрээр яг
ойр бүтээгдэхүүнийг олно. Тиймээс `--n 0` (бүх бүтээгдэхүүн) үед тоо нарийн, түүвэрлэх хэрэггүй.
`--mode image` нь query бүрийн эх зургийг жинхэнэ pipeline (decode, preprocess, FashionCLIP) болон
жинхэнэ HNSW хайлтаар upload шиг явуулна (`--phone` нь эхлээд зургийг утасны 1280 px болгоно).
Baseline болгож санамсаргүй эрэмбийг мөн харуулна.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from angel.core.config import get_settings
from angel.db.engine import create_engine
from angel.ml.benchmark.retrieval import (
    RELEVANCE,
    build_codes,
    exact_neighbours,
    random_neighbours,
    score,
)
from angel.ml.evaluation import make_upload
from angel.ml.fashion_clip import FashionClipEmbedder, select_device
from angel.ml.preprocess import load_image
from angel.models import Product
from angel.repositories.catalog.products import DEFAULT_EF_SEARCH, ProductRepository


class Catalogue:
    """Бүтээгдэхүүн бүрийн id, label, embedding. Нэг л удаа уншина."""

    def __init__(self, rows: list[Any]) -> None:
        self.ids = np.array([r.id for r in rows], dtype=np.int64)
        self.source_ids = [r.source_id for r in rows]
        self.embeddings = np.stack([np.asarray(r.embedding, dtype=np.float32) for r in rows])
        article = [r.article_type for r in rows]
        colour = [r.base_colour for r in rows]
        gender = [r.gender for r in rows]
        self.codes = build_codes(article, colour, gender)
        self.row_of_id = {int(i): row for row, i in enumerate(self.ids)}


async def load_catalogue(engine: Any) -> Catalogue:
    async with engine.connect() as connection:
        rows = (
            await connection.execute(
                select(
                    Product.id,
                    Product.source_id,
                    Product.article_type,
                    Product.base_colour,
                    Product.gender,
                    Product.embedding,
                )
            )
        ).all()
    return Catalogue(rows)


async def hnsw_neighbours(
    catalogue: Catalogue, args: argparse.Namespace, queries: NDArray[np.int64]
) -> NDArray[np.int64]:
    """Жинхэнэ зам: query-ийн өөрийн зураг pipeline-аар орж, жинхэнэ HNSW хайлт хийгдэнэ."""
    settings = get_settings()
    dataset = (args.dataset or settings.dataset_dir or Path()).expanduser()
    engine = create_engine(settings.database_url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    embedder = FashionClipEmbedder(device=select_device(args.device), resize_mode=args.resize_mode)
    embedder.load()
    side = 1280 if args.phone else None
    ranked = np.empty((len(queries), args.k), dtype=np.int64)
    for start in range(0, len(queries), 32):
        chunk = queries[start : start + 32]
        images = [
            load_image(
                make_upload(dataset / "images" / f"{catalogue.source_ids[row]}.jpg", side),
                min_side=800,
            )
            for row in chunk
        ]
        vectors = embedder.embed_images(images)
        for offset, (row, vector) in enumerate(zip(chunk, vectors, strict=True)):
            async with sessions() as session, session.begin():
                hits = await ProductRepository(session).search_similar(
                    vector, limit=args.k + 1, ef_search=args.ef_search
                )
            found = [
                catalogue.row_of_id[h.product.id]
                for h in hits
                if h.product.id != catalogue.ids[row]
            ]
            ranked[start + offset] = found[: args.k]
        print(f"  {min(start + 32, len(queries))}/{len(queries)} queries", end="\r", flush=True)
    print()
    await engine.dispose()
    return ranked


def print_table(title: str, results: dict[str, dict[str, dict[str, float | int]]]) -> None:
    print(f"\n{title}")
    print(
        f"{'level':<10}{'K':>4}  {'mAP':>7}  {'P@K':>7}  {'R@K':>7}  {'hit':>6}  {'nDCG':>7}"
        "  queries"
    )
    for level, per_k in results.items():
        for k, row in per_k.items():
            print(
                f"{level:<10}{k:>4}  {row['mAP']:7.4f}  {row['P']:7.4f}  {row['recall']:7.4f}  "
                f"{row['hit_rate']:6.3f}  {row['nDCG']:7.4f}  {row['queries_scored']}"
                + (
                    f" ({row['queries_skipped']} without any relevant product skipped)"
                    if row["queries_skipped"]
                    else ""
                )
            )


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(f"\nwritten {path}")


async def main_async(args: argparse.Namespace) -> int:
    ks = sorted({int(k) for k in args.ks.split(",")})
    args.k = max(ks)
    engine = create_engine(get_settings().database_url)
    catalogue = await load_catalogue(engine)
    await engine.dispose()
    size = len(catalogue.ids)
    types = np.unique(catalogue.codes["category"][catalogue.codes["category"] >= 0])
    print(f"{size} products, {len(types)} article types")

    wanted = args.n if args.n is not None else (0 if args.mode == "stored" else 500)
    rng = np.random.default_rng(args.seed)
    queries = (
        np.arange(size, dtype=np.int64)
        if wanted == 0 or wanted >= size
        else np.sort(rng.choice(size, wanted, replace=False)).astype(np.int64)
    )
    print(f"mode={args.mode}  queries={len(queries)}  seed={args.seed}  K up to {args.k}")

    if args.mode == "stored":
        ranked = exact_neighbours(catalogue.embeddings, queries, args.k)
    else:
        ranked = await hnsw_neighbours(catalogue, args, queries)
    results = score(catalogue.codes, queries, ranked, ks)
    baseline = score(
        catalogue.codes, queries, random_neighbours(size, queries, args.k, args.seed), ks
    )

    print_table("FashionCLIP + pgvector", results)
    print_table("Random ranking (baseline)", baseline)

    out = {
        "mode": args.mode,
        "phone_sized_uploads": bool(args.phone),
        "queries": len(queries),
        "catalogue_size": size,
        "seed": args.seed,
        "ks": ks,
        "relevance": RELEVANCE,
        "map_normalisation": (
            "sum of P@i * rel_i over the top K, divided by "
            "min(K, relevant products in the catalogue)"
        ),
        "system": results,
        "random_baseline": baseline,
    }
    if args.out:
        write_json(Path(args.out), out)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--mode", choices=["stored", "image"], default="stored")
    parser.add_argument(
        "--n",
        type=int,
        default=None,
        help="queries; 0 = every product (stored mode default), image mode default 500",
    )
    parser.add_argument("--ks", default="5,10,20", help="cut-offs to report, comma separated")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--phone", action="store_true", help="image mode: shrink each photo to 1280 px first"
    )
    parser.add_argument("--device", default="auto", choices=["auto", "mps", "cpu"])
    parser.add_argument("--resize-mode", default="pad", choices=["pad", "crop"])
    parser.add_argument("--ef-search", type=int, default=DEFAULT_EF_SEARCH)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument(
        "--out", default=None, help="write the numbers as JSON (e.g. ../../docs/perf/map.json)"
    )
    return asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
