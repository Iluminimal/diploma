"""API-ийн end-to-end latency: жинхэнэ апп (lifespan, middleware, multipart parsing, JSON
serialization, Redis cache) ingest хийсэн каталог дээр in-process ажиллаж, сонгосон device дээр
жинхэнэ model-тэй. Spec-ийн зорилттой (зургаар хайлт p95 < ~400 ms, төстэй бүтээгдэхүүн
p95 < 50 ms) харьцуулна.

    cd apps/api && uv run python ../../scripts/measure_api_latency.py --device cpu
    cd apps/api && uv run python ../../scripts/measure_api_latency.py --device mps

"cold" гэдэг нь Redis cache-д бичлэг байгаагүй, "cached" нь байсан гэсэн үг. Энэ ажлын үүсгэсэн
cache-үүдийг дараа нь устгана. Ажлын хугацаанд rate limiting унтраалттай.
"""

from __future__ import annotations

import argparse
import asyncio
import io
import itertools
import time
from pathlib import Path
from typing import Any

from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from PIL import Image
from redis.asyncio import Redis

from angel.core.config import Settings, get_settings
from angel.db.engine import create_engine
from angel.main import create_app
from angel.ml.evaluation import (
    format_percentiles,
    make_upload,
    ms_since,
    percentiles,
    sample_products,
)

TARGET_IMAGE_P95_MS = 400.0
TARGET_SIMILAR_P95_MS = 50.0
TARGET_DETECT_P95_MS = 150.0  # камерын live preview-ийн нэг кадр
LIVE_INTERVAL_S = 0.35  # вэбийн `use-live-detection`-ийн завсар
WARMUP = 10
API = "/api/v1"

COLOURS = ("red", "blue", "black", "white", "green", "pink", "grey", "brown", "yellow", "navy")
GARMENTS = ("dress", "t-shirt", "jeans", "sneakers", "handbag", "jacket", "watch", "shirt", "skirt")
STYLES = ("floral", "striped", "plain", "casual", "formal", "sporty", "vintage", "")


def distinct_queries(n: int) -> list[str]:
    combos = itertools.product(COLOURS, STYLES, GARMENTS)
    return [" ".join(part for part in combo if part) for combo in itertools.islice(combos, n)]


class Report:
    def __init__(self) -> None:
        self.ok = True

    def check(self, label: str, values: list[float], target_ms: float | None = None) -> None:
        print(format_percentiles(label, values))
        if target_ms is not None:
            p95 = percentiles(values)["p95"]
            verdict = "PASS" if p95 < target_ms else "FAIL"
            print(f"   target p95 < {target_ms:.0f} ms: {verdict} ({p95:.0f} ms)")
            self.ok &= p95 < target_ms


async def timed(client: AsyncClient, method: str, url: str, **kwargs: Any) -> tuple[float, Any]:
    start = time.perf_counter()
    response = await client.request(method, url, **kwargs)
    elapsed = ms_since(start)
    if response.status_code != 200:
        raise SystemExit(f"{method} {url} -> {response.status_code}: {response.text[:300]}")
    return elapsed, response.json()


async def clear_caches(redis: Redis, version: str) -> None:
    for pattern in (f"emb:txt:{version}:*", f"sim:{version}:*"):
        async for key in redis.scan_iter(pattern):
            await redis.delete(key)


async def main_async(args: argparse.Namespace) -> int:
    base = get_settings()
    dataset = (args.dataset or base.dataset_dir or Path()).expanduser()
    settings = Settings(
        app_env="test",
        log_level="WARNING",
        rate_limit_enabled=False,
        embedding_device=args.device,
        embedding_resize_mode=args.resize_mode,
    )
    engine = create_engine(settings.database_url)
    sample = await sample_products(engine, args.n + WARMUP, args.seed)
    await engine.dispose()
    paths = [dataset / "images" / f"{source_id}.jpg" for _, source_id in sample]
    product_ids = [product_id for product_id, _ in sample]
    report = Report()

    app = create_app(settings)
    started = time.perf_counter()
    async with LifespanManager(app, startup_timeout=300):
        print(f"start-up (model load + warm-up): {time.perf_counter() - started:.1f} s")
        model = app.state.embedding_service
        print(
            f"device={getattr(model, 'device', '?')} version={model.version} "
            f"requests per test={args.n}\n"
        )
        redis: Redis = app.state.redis
        await clear_caches(redis, model.version)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://bench", timeout=60
        ) as client:
            await run(client, args, paths, product_ids, report)
        await clear_caches(redis, model.version)
    return 0 if report.ok else 1


def collage(paths: list[Path], width: int) -> bytes:
    """Нэг мөрөнд зэрэгцүүлсэн бүтээгдэхүүний зургууд (олон хувцастай зургийн орлуулагч)."""
    cell = width // len(paths)
    canvas = Image.new("RGB", (cell * len(paths), cell * 4 // 3), (240, 240, 240))
    for slot, path in enumerate(paths):
        with Image.open(path) as photo:
            canvas.paste(photo.convert("RGB").resize((cell, cell * 4 // 3)), (cell * slot, 0))
    buffer = io.BytesIO()
    canvas.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


async def run(
    client: AsyncClient, args: argparse.Namespace, paths: list[Path], ids: list[int], report: Report
) -> None:
    n = args.n

    for label, side in (
        ("original upload (1800x2400)", None),
        ("phone-style upload (1280 px)", 1280),
    ):
        uploads = [make_upload(path, side) for path in paths]
        wall, decode, embed, db = [], [], [], []
        for index, data in enumerate(uploads):
            elapsed, body = await timed(
                client,
                "POST",
                f"{API}/search/image",
                files={"file": ("q.jpg", data, "image/jpeg")},
                data={"limit": "24"},
            )
            if index >= WARMUP:
                wall.append(elapsed)
                decode.append(body["timings"]["decode_ms"])
                embed.append(body["timings"]["embed_ms"])
                db.append(body["timings"]["db_ms"])
        print(f"== POST /search/image, {label}, {n} requests")
        report.check("  decode (Pillow)", decode)
        report.check("  embed (model + classify)", embed)
        report.check("  database", db)
        report.check("  END TO END (client wall time)", wall, TARGET_IMAGE_P95_MS)
        print()

    uploads = [make_upload(path, 1280) for path in paths]
    filtered = []
    for index, data in enumerate(uploads):
        elapsed, _ = await timed(
            client,
            "POST",
            f"{API}/search/image",
            files={"file": ("q.jpg", data, "image/jpeg")},
            data={
                "gender": ["Men", "Unisex"],
                "article_type": ["Tshirts", "Shirts", "Casual Shoes"],
                "min_price": "1000",
                "max_price": "15000",
                "in_stock": "true",
                "limit": "24",
            },
        )
        if index >= WARMUP:
            filtered.append(elapsed)
    print("== POST /search/image with 5 filters (phone-style upload)")
    report.check("  END TO END", filtered, TARGET_IMAGE_P95_MS)
    print()

    # Олон хувцастай зураг: гурван бүтээгдэхүүний зургийг нэг эгнээнд нааж (collage), хувцас бүрийн
    # үр дүнг нэг хүсэлтээр авна. `LOCALIZER=yolo` үед detection + batch embed + хувцас тутмын
    # хайлт.
    collages = [collage(paths[i : i + 3], 1280) for i in range(0, len(paths) - 2, 3)]
    garment_wall, garment_count = [], []
    for index, data in enumerate(collages):
        elapsed, body = await timed(
            client,
            "POST",
            f"{API}/search/garments",
            files={"file": ("q.jpg", data, "image/jpeg")},
            data={"limit": "6"},
        )
        garment_count.append(len(body["garments"]))
        if index >= WARMUP:
            garment_wall.append(elapsed)
    print(
        f"== POST /search/garments, 3-product collage (1280 px), {len(garment_wall)} requests, "
        f"{sum(garment_count) / len(garment_count):.1f} garments per photo on average"
    )
    report.check("  END TO END", garment_wall, TARGET_IMAGE_P95_MS)
    print()

    # Камерын live preview: 480 px-ийн кадрыг `/search/detect` руу (хайлтгүй).
    frames = [collage(paths[i : i + 3], 480) for i in range(0, len(paths) - 2, 3)]
    detect_wall = []
    for index, data in enumerate(frames):
        elapsed, _ = await timed(
            client, "POST", f"{API}/search/detect", files={"file": ("f.jpg", data, "image/jpeg")}
        )
        if index >= WARMUP:
            detect_wall.append(elapsed)
    print(f"== POST /search/detect, 480 px camera frame, {len(detect_wall)} requests")
    report.check("  END TO END", detect_wall, TARGET_DETECT_P95_MS)
    print()

    # Live давталт явж байхад жинхэнэ хайлт удаашрах уу: хайлтуудыг frame-ийн давталттай зэрэг.
    stop_live = asyncio.Event()

    async def live_preview() -> None:
        for data in itertools.cycle(frames):
            if stop_live.is_set():
                return
            await timed(
                client,
                "POST",
                f"{API}/search/detect",
                files={"file": ("f.jpg", data, "image/jpeg")},
            )
            await asyncio.sleep(LIVE_INTERVAL_S)

    live = asyncio.create_task(live_preview())
    during_live = []
    for index, data in enumerate(uploads[: WARMUP + 60]):
        elapsed, _ = await timed(
            client,
            "POST",
            f"{API}/search/image",
            files={"file": ("q.jpg", data, "image/jpeg")},
            data={"limit": "24"},
        )
        if index >= WARMUP:
            during_live.append(elapsed)
    stop_live.set()
    await live
    print("== POST /search/image (phone-style) WHILE a live camera preview is running")
    report.check("  END TO END", during_live, TARGET_IMAGE_P95_MS)
    print()

    queries = distinct_queries(n + WARMUP)
    cold, cached = [], []
    for index, query in enumerate(queries):
        elapsed, body = await timed(client, "POST", f"{API}/search/text", json={"query": query})
        assert body["cached"] is False
        if index >= WARMUP:
            cold.append(elapsed)
    for index, query in enumerate(queries):
        elapsed, body = await timed(client, "POST", f"{API}/search/text", json={"query": query})
        assert body["cached"] is True
        if index >= WARMUP:
            cached.append(elapsed)
    print(f"== POST /search/text, {n} distinct queries")
    report.check("  cold (embeds the text)", cold)
    report.check("  cached embedding", cached)
    print()

    hybrid = []
    for index, (data, query) in enumerate(zip(uploads, queries, strict=False)):
        elapsed, _ = await timed(
            client,
            "POST",
            f"{API}/search/hybrid",
            files={"file": ("q.jpg", data, "image/jpeg")},
            data={"query": query, "limit": "24"},
        )
        if index >= WARMUP:
            hybrid.append(elapsed)
    print("== POST /search/hybrid (phone-style upload + cached text)")
    report.check("  END TO END", hybrid, TARGET_IMAGE_P95_MS)
    print()

    similar_cold, similar_cached = [], []
    for index, product_id in enumerate(ids):
        elapsed, body = await timed(client, "GET", f"{API}/products/{product_id}/similar")
        assert body["cached"] is False
        if index >= WARMUP:
            similar_cold.append(elapsed)
    for index, product_id in enumerate(ids):
        elapsed, body = await timed(client, "GET", f"{API}/products/{product_id}/similar")
        assert body["cached"] is True
        if index >= WARMUP:
            similar_cached.append(elapsed)
    print(f"== GET /products/{{id}}/similar (k=12), {n} products")
    report.check("  cold (pgvector)", similar_cold, TARGET_SIMILAR_P95_MS)
    report.check("  cached", similar_cached, TARGET_SIMILAR_P95_MS)
    print()

    listings: dict[str, tuple[str, dict[str, Any]]] = {
        "newest, page 1": ("/products", {}),
        "filters + price sort": (
            "/products",
            {
                "gender": ["Men", "Unisex"],
                "color": ["Blue", "Black"],
                "master_category": "Apparel",
                "min_price": 1000,
                "max_price": 9000,
                "sort": "price_asc",
            },
        ),
        'full-text q="red shirt"': ("/products", {"q": "red shirt"}),
        "deep page (page 800)": ("/products", {"page": 800}),
    }
    print(f"== GET /products listing (24 per page), {n} requests each")
    for label, (path, params) in listings.items():
        values = []
        for index in range(n + WARMUP):
            elapsed, _ = await timed(client, "GET", f"{API}{path}", params=params)
            if index >= WARMUP:
                values.append(elapsed)
        report.check(f"  {label}", values)
    values = []
    for index in range(n + WARMUP):
        elapsed, _ = await timed(client, "GET", f"{API}/catalog/filters")
        if index >= WARMUP:
            values.append(elapsed)
    report.check("  GET /catalog/filters", values)
    print()

    print(f"== concurrency: {args.concurrency} clients sending phone-style image searches")
    semaphore = asyncio.Semaphore(args.concurrency)
    latencies: list[float] = []

    async def one(data: bytes) -> None:
        async with semaphore:
            elapsed, _ = await timed(
                client, "POST", f"{API}/search/image", files={"file": ("q.jpg", data, "image/jpeg")}
            )
            latencies.append(elapsed)

    wall_start = time.perf_counter()
    await asyncio.gather(*(one(data) for data in uploads[WARMUP:]))
    seconds = time.perf_counter() - wall_start
    report.check(f"  latency at concurrency {args.concurrency}", latencies)
    print(f"   throughput {len(latencies) / seconds:.1f} requests/s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--n", type=int, default=200)
    parser.add_argument("--seed", type=int, default=5)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--device", choices=["auto", "mps", "cpu", "cuda"], default="cpu")
    parser.add_argument(
        "--resize-mode", choices=["crop", "pad"], default=get_settings().embedding_resize_mode
    )
    return asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
