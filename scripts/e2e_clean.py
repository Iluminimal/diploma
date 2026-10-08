"""Remove what the end-to-end tests leave behind in a development database.

The tests register customers (`e2e-...@example.com`), place orders and create products named
"E2E ..."; the API can withdraw a product but never delete it. This deletes exactly those rows
and the product photos they wrote, nothing else, and refuses to run when APP_ENV=prod.

cd apps/api && uv run python ../../scripts/e2e_clean.py
make e2e-clean
"""

import asyncio

from sqlalchemy import text

from lookalike.core.config import get_settings
from lookalike.db.engine import create_engine
from lookalike.ingestion.images import THUMBNAIL_SIZES, thumbnail_key
from lookalike.storage import LocalStorage

E2E_EMAIL = r"^e2e-.*@example\.com$"


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
                text("DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email ~ :e)"),
                {"e": E2E_EMAIL},
            )
            products = await connection.execute(
                text("DELETE FROM products WHERE source_id IS NULL AND name LIKE 'E2E %'")
            )
            users = await connection.execute(
                text("DELETE FROM users WHERE email ~ :e"), {"e": E2E_EMAIL}
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
