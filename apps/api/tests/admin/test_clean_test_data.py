"""Туршилтын өгөгдлийг цэвэрлэх: зөвхөн заасан акаунт, датасетийн бараа үлдэнэ, нөөц буцна."""

from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.cli.clean_test_data import clean_test_data
from angel.cli.seed_demo import seed_demo
from angel.core.config import Settings
from angel.ingestion.images import THUMBNAIL_SIZES, thumbnail_key
from tests.conftest import ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

KEEP = "kept-owner@example.com"
MANUAL_KEY = "products/admin/0123456789abcdef"


async def scalar(engine: AsyncEngine, sql: str, **params: object) -> int:
    async with engine.connect() as connection:
        return int((await connection.execute(text(sql), params)).scalar_one() or 0)


async def exists_user(engine: AsyncEngine, email: str) -> bool:
    return await scalar(engine, "SELECT COUNT(*) FROM users WHERE email = :e", e=email) == 1


async def rename_one_customer(engine: AsyncEngine) -> None:
    """Demo customer-үүдийн нэгийг "үлдэх акаунт" болгоно."""
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE users SET email = :keep WHERE id = "
                "(SELECT id FROM users WHERE email LIKE 'demo-%' ORDER BY id LIMIT 1)"
            ),
            {"keep": KEEP},
        )


async def add_manual_product(engine: AsyncEngine) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO products (slug, name, category_id, gender, master_category, "
                "sub_category, article_type, price_cents, currency, stock_quantity, is_active, "
                "image_key, embedding, embedding_version) "
                "SELECT 'e2e-copy', 'E2E copy', category_id, gender, master_category, "
                "sub_category, article_type, price_cents, currency, 5, true, :key, embedding, "
                "embedding_version FROM products LIMIT 1"
            ),
            {"key": MANUAL_KEY},
        )


async def test_it_refuses_to_run_in_production(db_engine: AsyncEngine) -> None:
    prod = Settings(
        app_env="prod",
        jwt_secret="x" * 40,
        payments_mode="qpay",
        qpay_base_url="https://merchant.qpay.mn",
        qpay_client_id="ANGEL",
        qpay_client_secret="secret",
        qpay_invoice_code="ANGEL_INVOICE",
        oauth_mode="google",
        sms_mode="twilio",
        otp_dev_code="",
        twilio_account_sid="AC1",
        twilio_auth_token="t",
        twilio_from_number="+15005550006",
        mail_mode="smtp",
        smtp_host="smtp.example.com",
        mail_from="no-reply@example.com",
        google_client_id="id",
        google_client_secret="secret",
    )

    with pytest.raises(SystemExit, match="APP_ENV=prod"):
        await clean_test_data(db_engine, prod, [KEEP], apply=True)


async def test_it_needs_an_account_to_keep_and_that_account_must_exist(
    db_engine: AsyncEngine,
) -> None:
    settings = Settings(app_env="test")

    with pytest.raises(SystemExit, match="--keep-email"):
        await clean_test_data(db_engine, settings, [], apply=True)
    with pytest.raises(SystemExit, match="no such account"):
        await clean_test_data(db_engine, settings, ["nobody@example.com"], apply=True)


async def test_a_dry_run_only_counts_and_deleting_keeps_the_account_and_the_catalogue(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    settings = Settings(app_env="test", media_dir=tmp_path)
    async with api_factory(seed_count=60, media_dir=tmp_path):
        stock = await scalar(db_engine, "SELECT SUM(stock_quantity) FROM products")
        catalogue = await scalar(db_engine, "SELECT COUNT(*) FROM products")
        await seed_demo(db_engine, settings, customers=25, orders=80, seed=7)
        await rename_one_customer(db_engine)
        await add_manual_product(db_engine)
        files = [tmp_path / thumbnail_key(MANUAL_KEY, size) for size in THUMBNAIL_SIZES]
        for file in files:
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(b"webp")
        assert await exists_user(db_engine, KEEP)
        users_before = await scalar(db_engine, "SELECT COUNT(*) FROM users")

        preview = await clean_test_data(db_engine, settings, [KEEP], apply=False)

        assert not preview.applied
        assert preview.counts["users"] == users_before - 1
        assert preview.counts["orders"] > 0
        assert preview.counts["test_products"] == 1
        assert await scalar(db_engine, "SELECT COUNT(*) FROM users") == users_before
        assert await scalar(db_engine, "SELECT COUNT(*) FROM orders") == preview.counts["orders"]
        assert all(file.exists() for file in files)

        done = await clean_test_data(db_engine, settings, [KEEP], apply=True)

        assert done.applied
        assert await scalar(db_engine, "SELECT COUNT(*) FROM users") == 1
        assert await exists_user(db_engine, KEEP)
        for table in ("orders", "payments", "order_items", "order_events", "reviews"):
            assert await scalar(db_engine, f"SELECT COUNT(*) FROM {table}") == 0, table  # noqa: S608
        # Үлдэх акаунтын хаяг хэвээр, туршилтын бараа, зураг нь алга; бусад каталог хөндөгдөөгүй.
        assert await scalar(db_engine, "SELECT COUNT(*) FROM addresses") > 0
        assert await scalar(db_engine, "SELECT COUNT(*) FROM products") == catalogue
        assert not any(file.exists() for file in files)
        # Захиалга барьсан нөөц буцаж, сэтгэгдэлгүй болсон бараа бүрийн үнэлгээ 0.
        assert await scalar(db_engine, "SELECT SUM(stock_quantity) FROM products") == stock
        assert (
            await scalar(
                db_engine,
                "SELECT COUNT(*) FROM products WHERE rating_count <> 0 OR rating_average <> 0",
            )
            == 0
        )
