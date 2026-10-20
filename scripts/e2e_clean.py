"""End-to-end тестийн хөгжүүлэлтийн database-д үлдээсэн өгөгдлийг цэвэрлэнэ.

Тестүүд customer (`e2e-...@example.com`) бүртгэж, захиалга өгч, "E2E ..." нэртэй бүтээгдэхүүн
үүсгэдэг; API бүтээгдэхүүнийг хасаж чадах ч хэзээ ч устгадаггүй. Энэ нь зөвхөн тэдгээр мөр,
бичсэн зургийг устгана, өөр юм хөндөхгүй, APP_ENV=prod үед ажиллахаас татгалзана.

cd apps/api && uv run python ../../scripts/e2e_clean.py
make e2e-clean
"""

import asyncio

from sqlalchemy import text

from angel.core.config import get_settings
from angel.db.engine import create_engine
from angel.ingestion.images import THUMBNAIL_SIZES, thumbnail_key
from angel.storage import LocalStorage

E2E_EMAIL = r"^e2e-.*@example\.com$"
# Утасны тестүүд энэ мужийн дугаараар бүртгүүлдэг (apps/web/e2e/support/api.ts-г үз).
E2E_PHONE = r"^\+1415555[0-9]{4}$"


async def clean() -> str:
    settings = get_settings()
    if settings.app_env == "prod":
        raise SystemExit("refusing to delete data when APP_ENV=prod")
    engine = create_engine(settings.database_url)
    try:
        async with engine.begin() as connection:
            keys = [
                key
                for (key,) in await connection.execute(
                    text(
                        "SELECT image_key FROM products "
                        "WHERE source_id IS NULL AND name LIKE 'E2E %'"
                    )
                )
            ]
            orders = await connection.execute(
                text(
                    "DELETE FROM orders WHERE user_id IN "
                    "(SELECT id FROM users WHERE email ~ :e OR phone ~ :p)"
                ),
                {"e": E2E_EMAIL, "p": E2E_PHONE},
            )
            products = await connection.execute(
                text("DELETE FROM products WHERE source_id IS NULL AND name LIKE 'E2E %'")
            )
            users = await connection.execute(
                text("DELETE FROM users WHERE email ~ :e OR phone ~ :p"),
                {"e": E2E_EMAIL, "p": E2E_PHONE},
            )
    finally:
        await engine.dispose()
    storage = LocalStorage(settings.media_dir, settings.media_base_url)
    for key in keys:
        for size in THUMBNAIL_SIZES:
            storage.delete(thumbnail_key(key, size))
    return (
        f"removed {users.rowcount} test customers, {orders.rowcount} orders, "
        f"{products.rowcount} products and {len(keys) * len(THUMBNAIL_SIZES)} image files"
    )


if __name__ == "__main__":
    print(asyncio.run(clean()))
