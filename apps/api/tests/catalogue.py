"""A small searchable catalogue with known content, for API tests.

Every product has its own JPEG; its stored embedding is what the (fake) model produces for that
exact image, so uploading the JPEG must return the product at rank 1.
"""

import io
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from lookalike.ingestion.cleaning import CleanProduct
from lookalike.ingestion.pipeline import _upsert, build_row, ensure_categories
from lookalike.ml.fake import FakeEmbedder
from lookalike.ml.preprocess import load_image

GENDERS = ("Men", "Women", "Unisex")
TYPES = (
    ("Apparel", "Topwear", "Shirts"),
    ("Apparel", "Topwear", "Tshirts"),
    ("Apparel", "Bottomwear", "Jeans"),
    ("Footwear", "Shoes", "Casual Shoes"),
)
COLOURS = ("Blue", "Red", "Black", None)


@dataclass(frozen=True)
class Entry:
    source_id: int
    product_id: int
    jpeg: bytes
    gender: str
    article_type: str
    price_cents: int
    in_stock: bool


def make_jpeg(seed: int, size: tuple[int, int] = (120, 160)) -> bytes:
    pixels = np.random.default_rng(seed).integers(0, 256, (size[1], size[0], 3), dtype=np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(pixels).save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


async def seed_catalogue(
    engine: AsyncEngine, embedder: FakeEmbedder, count: int = 40
) -> list[Entry]:
    """Products 1..count. Gender, type and colour cycle; price is 1000 + 100 * n except that
    every 6th product shares one price (to exercise tie-breaking); every 5th is out of stock."""
    jpegs: dict[int, bytes] = {}
    products: list[CleanProduct] = []
    vectors = []
    for n in range(1, count + 1):
        master, sub, article = TYPES[n % len(TYPES)]
        jpegs[n] = make_jpeg(n)
        vectors.append(embedder.embed_images([load_image(jpegs[n])])[0])
        products.append(
            CleanProduct(
                source_id=n,
                name=f"Brand {article} number {n}",
                gender=GENDERS[n % len(GENDERS)],
                master_category=master,
                sub_category=sub,
                article_type=article,
                base_colour=COLOURS[n % len(COLOURS)],
                season="Summer" if n % 2 else "Winter",
                usage="Casual",
                year=2012,
                image_path=Path("unused.jpg"),
            )
        )
    async with engine.begin() as connection:
        category_ids = await ensure_categories(connection, products)
        rows = [
            build_row(
                p,
                category_id=category_ids[(p.master_category, p.sub_category, p.article_type)],
                blur_data_url=None,
                embedding=vector,
                version=embedder.version,
                seed=1,
            )
            for p, vector in zip(products, vectors, strict=True)
        ]
        await _upsert(connection, rows)
        await connection.execute(
            text(
                "UPDATE products SET price_cents = CASE WHEN source_id % 6 = 0 THEN 5000 "
                "ELSE 1000 + 100 * source_id END, "
                "stock_quantity = CASE WHEN source_id % 5 = 0 THEN 0 ELSE 7 END"
            )
        )
        id_rows = (await connection.execute(text("SELECT source_id, id FROM products"))).all()
        ids: dict[int, int] = dict(id_rows)
    return [
        Entry(
            source_id=p.source_id,
            product_id=ids[p.source_id],
            jpeg=jpegs[p.source_id],
            gender=p.gender,
            article_type=p.article_type,
            price_cents=5000 if p.source_id % 6 == 0 else 1000 + 100 * p.source_id,
            in_stock=p.source_id % 5 != 0,
        )
        for p in products
    ]
