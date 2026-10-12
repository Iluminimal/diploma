"""The demo data: complete, consistent with the rest of the shop, and removable."""

from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.cli.seed_demo import DEMO_PASSWORD, clean_demo, seed_demo
from angel.core.config import Settings
from tests.commerce import another_client
from tests.conftest import ApiFactory
from tests.test_admin_orders_api import administrator

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

SETTINGS = Settings(app_env="test")
ADMIN = "/api/v1/admin"


async def scalar(engine: AsyncEngine, sql: str, **params: object) -> int:
    async with engine.connect() as connection:
        return int((await connection.execute(text(sql), params)).scalar_one())


# Each query counts rows that break a rule; the demo data must have none.
BROKEN = {
    "totals add up": (
        "SELECT COUNT(*) FROM orders WHERE total_cents <> subtotal_cents + shipping_cents"
    ),
    "every order has a payment": (
        "SELECT COUNT(*) FROM orders o "
        "WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id)"
    ),
    "every order starts with a placed event": (
        "SELECT COUNT(*) FROM orders o WHERE NOT EXISTS "
        "(SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.type = 'placed')"
    ),
    "shipped orders have tracking": (
        "SELECT COUNT(*) FROM orders WHERE status IN ('shipped', 'delivered') "
        "AND (tracking_number IS NULL OR shipped_at IS NULL)"
    ),
    "nothing happens in the future": (
        "SELECT COUNT(*) FROM orders WHERE created_at > now() OR paid_at > now() "
        "OR shipped_at > now() OR delivered_at > now()"
    ),
    "stock is never negative": "SELECT COUNT(*) FROM products WHERE stock_quantity < 0",
    "ratings match the published reviews": (
        "SELECT COUNT(*) FROM products p WHERE p.rating_count <> "
        "(SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.status = 'published')"
    ),
}


async def test_it_refuses_to_run_in_production(db_engine: AsyncEngine) -> None:
    prod = Settings(
        app_env="prod",
        jwt_secret="x" * 40,
        payments_mode="stripe",
        stripe_secret_key="k",
        stripe_webhook_secret="w",
        oauth_mode="google",
        google_client_id="id",
        google_client_secret="secret",
    )

    with pytest.raises(SystemExit, match="APP_ENV=prod"):
        await seed_demo(db_engine, prod)


async def test_it_stops_when_there_are_no_products(db_engine: AsyncEngine) -> None:
    with pytest.raises(SystemExit, match="make ingest"):
        await seed_demo(db_engine, SETTINGS)


async def test_the_demo_shop_has_every_kind_of_order_and_adds_up(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=60, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        stock_before = await scalar(db_engine, "SELECT SUM(stock_quantity) FROM products")

        summary = await seed_demo(db_engine, SETTINGS, customers=25, orders=80, seed=7)

        assert summary is not None
        assert summary.orders >= 60
        assert {"pending", "paid", "shipped", "delivered", "cancelled", "refunded"} <= set(
            summary.statuses
        )
        assert summary.reviews > 0
        for rule, sql in BROKEN.items():
            assert await scalar(db_engine, sql) == 0, rule
        assert await scalar(db_engine, "SELECT SUM(stock_quantity) FROM products") < stock_before

        stats = (
            await api.client.get(f"{ADMIN}/stats", params={"days": 30}, headers=admin.auth)
        ).json()
        assert stats["revenue_cents"]["current"] > 0
        assert stats["revenue_cents"]["previous"] > 0
        assert stats["to_ship"] > 0
        assert len(stats["top_products"]) == 5
        assert stats["new_customers"]["current"] > 0
        customers = (await api.client.get(f"{ADMIN}/customers", headers=admin.auth)).json()
        assert customers["total"] == 25
        assert any(c["total_spent_cents"] > 0 for c in customers["items"])


async def test_a_demo_customer_can_sign_in_and_see_their_orders(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=40, media_dir=tmp_path) as api:
        await seed_demo(db_engine, SETTINGS, customers=10, orders=40, seed=3)
        async with db_engine.connect() as connection:
            email = (
                await connection.execute(
                    text(
                        "SELECT u.email FROM users u JOIN orders o ON o.user_id = u.id "
                        "WHERE u.is_active AND o.status = 'delivered' LIMIT 1"
                    )
                )
            ).scalar_one()

        async with another_client(api) as browser:
            login = await browser.post(
                "/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD}
            )
            assert login.status_code == 200, login.text
            orders = await browser.get(
                "/api/v1/orders",
                headers={"Authorization": f"Bearer {login.json()['access_token']}"},
            )
            number = orders.json()["items"][0]["number"]
            detail = await browser.get(
                f"/api/v1/orders/{number}",
                headers={"Authorization": f"Bearer {login.json()['access_token']}"},
            )

        assert orders.status_code == 200
        assert [e["type"] for e in detail.json()["events"]][:2] == ["placed", "paid"]


async def test_seeding_is_repeatable_and_idempotent(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=40, media_dir=tmp_path):
        first = await seed_demo(db_engine, SETTINGS, orders=30, seed=11)
        orders = await scalar(db_engine, "SELECT COUNT(*) FROM orders")

        again = await seed_demo(db_engine, SETTINGS, orders=30, seed=11)

        assert first is not None
        assert again is None
        assert await scalar(db_engine, "SELECT COUNT(*) FROM orders") == orders


async def test_cleaning_removes_it_all_and_gives_the_stock_back(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=60, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        stock = "SELECT COALESCE(SUM(stock_quantity), 0) FROM products"
        before = await scalar(db_engine, stock)
        await seed_demo(db_engine, SETTINGS, orders=80, seed=5)
        assert await scalar(db_engine, stock) < before

        message = await clean_demo(db_engine)

        assert message.startswith("removed 25 demo customers")
        assert await scalar(db_engine, stock) == before
        for table in ("orders", "order_items", "order_events", "payments", "reviews", "addresses"):
            count = await scalar(db_engine, "SELECT COUNT(*) FROM " + table)  # noqa: S608
            assert count == 0, table
        assert await scalar(db_engine, "SELECT COUNT(*) FROM users WHERE role = 'customer'") == 0
        assert await scalar(db_engine, "SELECT COUNT(*) FROM products WHERE rating_count <> 0") == 0
        assert (
            await scalar(db_engine, "SELECT COUNT(*) FROM users WHERE id = :id", id=admin.user_id)
            == 1
        )
        assert await clean_demo(db_engine) == "no demo data to remove"


async def test_cleaning_leaves_real_customers_alone(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    from tests.test_admin_orders_api import place_order

    async with api_factory(seed_count=40, media_dir=tmp_path) as api:
        from tests.test_admin_orders_api import in_stock

        shopper, number = await place_order(api, in_stock(api, 0), pay=True)
        await seed_demo(db_engine, SETTINGS, orders=20, seed=2)

        await clean_demo(db_engine)

        assert (
            await scalar(db_engine, "SELECT COUNT(*) FROM orders WHERE number = :n", n=number) == 1
        )
        assert (
            await scalar(db_engine, "SELECT COUNT(*) FROM users WHERE id = :id", id=shopper.user_id)
            == 1
        )
