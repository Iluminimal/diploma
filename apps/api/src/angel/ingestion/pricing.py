"""Deterministic synthetic prices and stock. The dataset has neither.

Each product's values depend only on (seed, source_id, category), never on row order or on
which subset is being ingested, so a `--limit` run and the full run agree.
"""

import hashlib
import math
import random

CURRENCY = "USD"
DEFAULT_SEED = 20240607

# Typical price in whole dollars, most specific match first: article type, sub category, master.
_BY_ARTICLE_TYPE = {
    "Tshirts": 25, "Shirts": 42, "Jeans": 58, "Trousers": 52, "Shorts": 30, "Dresses": 65,
    "Tops": 30, "Jackets": 95, "Sweaters": 55, "Sweatshirts": 48, "Kurtas": 38, "Sarees": 85,
    "Casual Shoes": 62, "Sports Shoes": 78, "Formal Shoes": 85, "Heels": 70, "Flats": 40,
    "Sandals": 38, "Flip Flops": 18, "Watches": 120, "Handbags": 75, "Backpacks": 55,
    "Sunglasses": 60, "Wallets": 32, "Belts": 24, "Socks": 9, "Caps": 20, "Scarves": 26,
}  # fmt: skip
_BY_SUB_CATEGORY = {
    "Topwear": 36, "Bottomwear": 48, "Innerwear": 16, "Loungewear and Nightwear": 30,
    "Saree": 85, "Dress": 65, "Shoes": 62, "Sandal": 38, "Flip Flops": 18, "Watches": 120,
    "Bags": 65, "Jewellery": 45, "Eyewear": 60, "Wallets": 32, "Belts": 24, "Socks": 9,
    "Headwear": 20, "Scarves": 26, "Ties": 22, "Gloves": 18, "Accessories": 28,
}  # fmt: skip
_BY_MASTER_CATEGORY = {"Apparel": 40, "Footwear": 60, "Accessories": 30}
_FALLBACK_BASE = 35

OUT_OF_STOCK_RATE = 0.08
MAX_STOCK = 120


def base_price_dollars(article_type: str, sub_category: str, master_category: str) -> int:
    return (
        _BY_ARTICLE_TYPE.get(article_type)
        or _BY_SUB_CATEGORY.get(sub_category)
        or _BY_MASTER_CATEGORY.get(master_category)
        or _FALLBACK_BASE
    )


def generate_price_and_stock(
    source_id: int,
    *,
    article_type: str,
    sub_category: str,
    master_category: str,
    seed: int = DEFAULT_SEED,
) -> tuple[int, int]:
    """Return `(price_cents, stock_quantity)`. Prices end in .99; ~8% of products are sold out."""
    digest = hashlib.sha256(f"{seed}:{source_id}".encode()).digest()
    rng = random.Random(int.from_bytes(digest[:8], "big"))  # noqa: S311 - not security related
    base = base_price_dollars(article_type, sub_category, master_category)
    factor = min(3.0, max(0.4, math.exp(rng.gauss(0.0, 0.35))))
    dollars = max(5, round(base * factor))
    price_cents = dollars * 100 - 1
    if rng.random() < OUT_OF_STOCK_RATE:
        return price_cents, 0
    return price_cents, min(MAX_STOCK, 1 + int(rng.expovariate(1 / 25)))
