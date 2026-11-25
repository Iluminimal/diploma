"""Хөгжүүлэлтийн database дахь БҮХ туршилтын өгөгдлийг устгана (deploy-ийн өмнөх цэвэрлэгээ).

Үлдэх нь: `--keep-email`-ээр заасан хэрэглэгч(ид) (хаяг, хүссэн жагсаалт нь хамт), датасетээс
ачаалсан бараа (`source_id IS NOT NULL`) болон ангилал. Устах нь: бусад бүх хэрэглэгч (e2e, demo,
`deleted-*`), БҮХ захиалга, сэтгэгдэл (үлдэх хэрэглэгчийнх ч), зочны сагс, security event,
staff audit log, админы самбараас гараар нэмсэн бараа (`source_id IS NULL`, `products/admin/...`
зураг) болон тэдгээрийн зургийн файл. Захиалгын барьж байсан нөөцийг буцааж, үнэлгээг дахин бодно.

Анхдагчаар зөвхөн юу устахыг тоолж харуулна (dry-run); жинхэнээр устгахад `--yes` өгнө.
`APP_ENV=prod` үед ажиллахаас татгалзана.
"""

import argparse
import asyncio
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from angel.core.config import Settings, get_settings
from angel.db.engine import create_engine
from angel.ingestion.images import THUMBNAIL_SIZES, thumbnail_key
from angel.storage import LocalStorage

# Админы самбараас нэмсэн бараа: `source_id`-гүй, зураг нь `products/admin/` дор.
TEST_PRODUCTS = "source_id IS NULL AND image_key LIKE 'products/admin/%'"

# Нөөцийг барьж байгаа захиалга (`clean_demo`-той ижил дүрэм): refund хийсэн нь бараагаа
# буцаагаагүй бол л барина.
HOLDS_STOCK = """
    o.status IN ('pending', 'paid', 'shipped', 'delivered')
    OR (o.status = 'refunded' AND EXISTS (
        SELECT 1 FROM order_events e
        WHERE e.order_id = o.id AND e.type = 'refunded' AND e.data ->> 'restock' = 'false'))
"""

RESTOCK = f"""
    UPDATE products p SET stock_quantity = p.stock_quantity + t.units
    FROM (
        SELECT oi.product_id, SUM(oi.quantity) AS units
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE {HOLDS_STOCK}
        GROUP BY oi.product_id
    ) t WHERE p.id = t.product_id
"""  # noqa: S608 - HOLDS_STOCK is a constant, not user input

COUNTS = {
    "users": "SELECT COUNT(*) FROM users WHERE NOT COALESCE(lower(email) = ANY(:keep), false)",
    "orders": "SELECT COUNT(*) FROM orders",
    "reviews": "SELECT COUNT(*) FROM reviews",
    "carts": "SELECT COUNT(*) FROM carts c LEFT JOIN users u ON u.id = c.user_id "
    "WHERE u.id IS NULL OR NOT COALESCE(lower(u.email) = ANY(:keep), false)",
    "security_events": "SELECT COUNT(*) FROM security_events",
    "staff_audit_log": "SELECT COUNT(*) FROM staff_audit_log",
    "test_products": f"SELECT COUNT(*) FROM products WHERE {TEST_PRODUCTS}",  # noqa: S608
}


@dataclass(frozen=True)
class Report:
    counts: dict[str, int]
    applied: bool
    image_files: int

    def __str__(self) -> str:
        head = "removed" if self.applied else "would remove (dry-run; add --yes to delete)"
        body = ", ".join(f"{count} {name}" for name, count in self.counts.items())
        return f"{head}: {body}, {self.image_files} image files"


async def _count(connection: AsyncConnection, keep: list[str]) -> dict[str, int]:
    return {
        name: int((await connection.execute(text(sql), {"keep": keep})).scalar_one())
        for name, sql in COUNTS.items()
    }


async def _delete(connection: AsyncConnection, keep: list[str]) -> None:
    params: dict[str, Any] = {"keep": keep}
    # 1) Захиалгын барьж байсан нөөцийг буцаана (устгах бараа биш, үлдэх бараанд л чухал).
    await connection.execute(text(RESTOCK))
    # 2) Сэтгэгдэл (бүгд туршилтынх), захиалга (payments, items, events хамт), дараа нь бусад
    #    хэрэглэгч (cascade: хаяг, сагс, хүссэн жагсаалт, token, OTP, OAuth). Үлдэх хэрэглэгчийн
    #    захиалга ч устна.
    await connection.execute(text("DELETE FROM reviews"))
    await connection.execute(text("DELETE FROM orders"))
    await connection.execute(
        text("DELETE FROM users WHERE NOT COALESCE(lower(email) = ANY(:keep), false)"), params
    )
    # 3) Зочны сагс, үлдсэн лог.
    await connection.execute(text("DELETE FROM carts WHERE user_id IS NULL"))
    await connection.execute(text("DELETE FROM security_events"))
    await connection.execute(text("DELETE FROM staff_audit_log"))
    # 4) Туршилтын бараа (cascade: сагс, хүссэн жагсаалт, сэтгэгдэл).
    await connection.execute(text(f"DELETE FROM products WHERE {TEST_PRODUCTS}"))  # noqa: S608
    # 5) Устсан сэтгэгдлийн дараа үнэлгээг дахин бодно.
    await connection.execute(
        text(
            """
            UPDATE products SET
              rating_count = (SELECT COUNT(*) FROM reviews r
                              WHERE r.product_id = products.id AND r.status = 'published'),
              rating_average = COALESCE((SELECT ROUND(AVG(r.rating), 2) FROM reviews r
                              WHERE r.product_id = products.id AND r.status = 'published'), 0)
            WHERE rating_count <> 0 OR rating_average <> 0
            """
        )
    )


async def clean_test_data(
    engine: AsyncEngine, settings: Settings, keep_emails: list[str], *, apply: bool
) -> Report:
    if settings.app_env == "prod":
        raise SystemExit("refusing to delete data when APP_ENV=prod")
    keep = [email.strip().lower() for email in keep_emails if email.strip()]
    if not keep:
        raise SystemExit("pass at least one --keep-email, otherwise every account would be removed")
    storage = LocalStorage(settings.media_dir, settings.media_base_url)
    async with engine.begin() as connection:
        found = set(
            (
                await connection.execute(
                    text("SELECT lower(email) FROM users WHERE lower(email) = ANY(:keep)"),
                    {"keep": keep},
                )
            )
            .scalars()
            .all()
        )
        missing = sorted(set(keep) - found)
        if missing:
            raise SystemExit(f"no such account to keep: {', '.join(missing)}")
        found_keys = await connection.execute(
            text(f"SELECT image_key FROM products WHERE {TEST_PRODUCTS}")  # noqa: S608
        )
        keys = list(found_keys.scalars().all())
        counts = await _count(connection, keep)
        if apply:
            await _delete(connection, keep)
    if apply:
        for key in keys:
            for size in THUMBNAIL_SIZES:
                storage.delete(thumbnail_key(key, size))
    return Report(counts, apply, len(keys) * len(THUMBNAIL_SIZES))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="clean_test_data", description=__doc__)
    parser.add_argument(
        "--keep-email",
        action="append",
        default=[],
        required=True,
        help="account to keep (repeatable); every other account is removed",
    )
    parser.add_argument("--yes", action="store_true", help="really delete (default: dry-run)")
    args = parser.parse_args(argv)
    print(asyncio.run(_run(args)))
    return 0


async def _run(args: argparse.Namespace) -> str:
    settings = get_settings()
    engine = create_engine(settings.database_url)
    try:
        report = await clean_test_data(engine, settings, args.keep_email, apply=args.yes)
    finally:
        await engine.dispose()
    return str(report)
