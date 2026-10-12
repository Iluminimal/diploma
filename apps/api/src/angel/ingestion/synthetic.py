"""A small synthetic catalogue for end-to-end tests, where there is no dataset and no model.

Everything about it is deterministic. Images are drawn (a coloured garment-like shape on a
coloured ground), written as the same 400/800 px WebP thumbnails real ingestion writes, and each
product's embedding is computed from the decoded 800 px thumbnail. A visitor who downloads a
product's photo and searches with it uploads those exact bytes, so with the fake embedder the
product ranks first, as it does with FashionCLIP on the real catalogue.
"""

import argparse
import asyncio
import colorsys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.core.config import get_settings
from angel.core.uploads import ALLOWED_FORMATS
from angel.db.engine import create_engine
from angel.ingestion.cleaning import CleanProduct
from angel.ingestion.images import (
    THUMBNAIL_SIZES,
    build_thumbnails,
    image_key,
    thumbnail_key,
)
from angel.ingestion.pipeline import _upsert, build_row, ensure_categories
from angel.ingestion.pricing import DEFAULT_SEED
from angel.ml.embeddings import EmbeddingService
from angel.ml.fake import FakeEmbedder
from angel.ml.preprocess import load_image
from angel.storage import LocalStorage, Storage

ARTICLES = (
    ("Apparel", "Topwear", "Shirts"),
    ("Apparel", "Topwear", "Tshirts"),
    ("Apparel", "Bottomwear", "Jeans"),
    ("Apparel", "Topwear", "Kurtas"),
    ("Footwear", "Shoes", "Casual Shoes"),
    ("Accessories", "Bags", "Handbags"),
)
GENDERS = ("Women", "Men", "Unisex", "Girls", "Boys")
COLOURS = ("Blue", "Red", "Black", "White", "Green", "Yellow")
BRANDS = ("Avirate", "Nordkap", "Fable", "Marlow", "Quill", "Ostrava")
# Plenty of units, so tests that buy one never collide; every tenth product is sold out.
STOCK = 40
SOLD_OUT_EVERY = 10


def garment_image(seed: int) -> Image.Image:
    """A 3:4 picture that differs from every other seed's and looks vaguely like a garment."""
    rng = np.random.default_rng(seed)
    hue, ground = rng.random(), rng.random()

    def colour(h: float, lightness: float) -> tuple[int, int, int]:
        r, g, b = colorsys.hls_to_rgb(h % 1.0, lightness, 0.55)
        return int(r * 255), int(g * 255), int(b * 255)

    image = Image.new("RGB", (600, 800), colour(ground, 0.88))
    draw = ImageDraw.Draw(image)
    body = colour(hue, 0.45)
    draw.rounded_rectangle((170, 200, 430, 700), radius=40, fill=body)  # body
    draw.polygon([(170, 220), (60, 330), (110, 380), (170, 320)], fill=body)  # sleeves
    draw.polygon([(430, 220), (540, 330), (490, 380), (430, 320)], fill=body)
    for _ in range(int(rng.integers(2, 7))):
        y = int(rng.integers(260, 660))
        draw.rectangle((170, y, 430, y + int(rng.integers(8, 30))), fill=colour(hue + 0.5, 0.8))
    return image


async def seed_catalogue(
    engine: AsyncEngine, storage: Storage, embedder: EmbeddingService, count: int
) -> int:
    """Products 1..count, safe to run again: rows are upserted and thumbnails overwritten."""
    products: list[CleanProduct] = []
    vectors = []
    blurs: dict[int, str] = {}
    for n in range(1, count + 1):
        master, sub, article = ARTICLES[n % len(ARTICLES)]
        thumbnails = build_thumbnails(garment_image(n))
        base = image_key(n)
        for size in THUMBNAIL_SIZES:
            storage.put(thumbnail_key(base, size), thumbnails.webp[size])
        served = load_image(
            thumbnails.webp[max(THUMBNAIL_SIZES)], min_side=800, formats=ALLOWED_FORMATS
        )
        vectors.append((await embedder.aembed_images([served]))[0])
        blurs[n] = thumbnails.blur_data_url
        colour = COLOURS[n % len(COLOURS)]
        products.append(
            CleanProduct(
                source_id=n,
                name=f"{BRANDS[n % len(BRANDS)]} {colour} {article} {n}",
                gender=GENDERS[n % len(GENDERS)],
                master_category=master,
                sub_category=sub,
                article_type=article,
                base_colour=colour,
                season=("Summer", "Winter", "Fall", "Spring")[n % 4],
                usage=("Casual", "Formal", "Sports")[n % 3],
                year=2012 + n % 8,
                image_path=Path("synthetic"),
            )
        )
    async with engine.begin() as connection:
        category_ids = await ensure_categories(connection, products)
        rows = [
            build_row(
                p,
                category_id=category_ids[(p.master_category, p.sub_category, p.article_type)],
                blur_data_url=blurs[p.source_id],
                embedding=vector,
                version=embedder.version,
                seed=DEFAULT_SEED,
            )
            for p, vector in zip(products, vectors, strict=True)
        ]
        await _upsert(connection, rows)
        await connection.execute(
            text(
                "UPDATE products SET stock_quantity = "
                "CASE WHEN source_id % :every = 0 THEN 0 ELSE :stock END WHERE source_id <= :count"
            ),
            {"every": SOLD_OUT_EVERY, "stock": STOCK, "count": count},
        )
    return count


async def _run(count: int) -> str:
    settings = get_settings()
    if settings.app_env == "prod":
        raise SystemExit("refusing to seed synthetic products when APP_ENV=prod")
    engine = create_engine(settings.database_url)
    try:
        storage = LocalStorage(settings.media_dir, settings.media_base_url)
        embedder = FakeEmbedder(version="fake@e2e")
        await seed_catalogue(engine, storage, embedder, count)
    finally:
        await engine.dispose()
    return f"seeded {count} synthetic products into {settings.media_dir}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="seed_e2e", description=__doc__)
    parser.add_argument("--count", type=int, default=60, help="how many products (default 60)")
    args = parser.parse_args(argv)
    print(asyncio.run(_run(args.count)))
    return 0
