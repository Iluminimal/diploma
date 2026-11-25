"""Агуулахын самбар: илгээх дараалал, хоцролт, нөөцийн анхааруулга, өөрийн үйлдлүүд."""

from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.admin.test_admin_orders_api import administrator, in_stock, place_order, warehouse_worker
from tests.conftest import Api, ApiFactory
from tests.support.commerce import Shopper, set_product

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ADMIN = "/api/v1/admin"
SHIP = {"carrier": "DHL", "tracking_number": "JD0146"}


async def board(api: Api, staff: Shopper) -> dict[str, Any]:
    response = await api.client.get(f"{ADMIN}/fulfillment", headers=staff.auth)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def paid_hours_ago(engine: AsyncEngine, number: str, hours: int) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE orders SET paid_at = now() - make_interval(hours => :h) WHERE number = :n"
            ),
            {"h": hours, "n": number},
        )


async def test_an_empty_shop_has_a_quiet_board(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        worker = await warehouse_worker(api, db_engine)

        body = await board(api, worker)

        assert (body["to_ship"], body["overdue"], body["queue"]) == (0, 0, [])
        assert (body["shipped_today"], body["delivered_today"]) == (0, 0)
        assert body["oldest_paid_at"] is None
        assert body["avg_ship_hours"] is None
        assert body["my_activity"] == []
        assert body["sla_hours"] == 24


async def test_the_queue_lists_paid_orders_longest_waiting_first_and_flags_the_late_ones(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        worker = await warehouse_worker(api, db_engine)
        _, recent = await place_order(api, in_stock(api, 0), pay=True)
        _, late = await place_order(api, in_stock(api, 1), pay=True)
        await place_order(api, in_stock(api, 2), pay=False)
        await paid_hours_ago(db_engine, late, 30)

        body = await board(api, worker)

        assert [q["number"] for q in body["queue"]] == [late, recent]
        first, second = body["queue"]
        assert (first["overdue"], second["overdue"]) == (True, False)
        assert first["waiting_hours"] >= 30
        assert first["item_count"] == 2
        assert first["customer_name"] == "Болд Батбаяр"
        assert first["lines"][0]["quantity"] == 2
        assert first["lines"][0]["image"]["thumb_400"]
        assert (body["to_ship"], body["overdue"]) == (2, 1)
        assert body["oldest_paid_at"] is not None


async def test_shipping_moves_an_order_out_of_the_queue_and_into_todays_figures(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        worker = await warehouse_worker(api, db_engine)
        _, number = await place_order(api, in_stock(api, 0), pay=True)
        await paid_hours_ago(db_engine, number, 3)

        await api.client.post(f"{ADMIN}/orders/{number}/ship", json=SHIP, headers=worker.auth)
        shipped = await board(api, worker)
        await api.client.post(f"{ADMIN}/orders/{number}/deliver", headers=worker.auth)
        delivered = await board(api, worker)

        assert (shipped["queue"], shipped["to_ship"], shipped["shipped_today"]) == ([], 0, 1)
        assert 2.5 <= shipped["avg_ship_hours"] <= 3.5
        assert delivered["delivered_today"] == 1


async def test_sold_out_and_low_products_are_listed_emptiest_first(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=8, media_dir=tmp_path) as api:
        worker = await warehouse_worker(api, db_engine)
        ids = [e.product_id for e in api.entries[:4]]
        for entry in api.entries[4:]:
            await set_product(db_engine, entry.product_id, stock_quantity=50)
        await set_product(db_engine, ids[0], stock_quantity=3)
        await set_product(db_engine, ids[1], stock_quantity=0)
        await set_product(db_engine, ids[2], stock_quantity=5)
        await set_product(db_engine, ids[3], stock_quantity=6)

        body = await board(api, worker)

        assert [p["id"] for p in body["stock_alerts"]] == [ids[1], ids[0], ids[2]]
        assert (body["out_of_stock"], body["low_stock"]) == (1, 2)
        assert body["low_stock_threshold"] == 5


async def test_my_activity_is_only_my_own(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=4, media_dir=tmp_path) as api:
        mine = await warehouse_worker(api, db_engine)
        other = await warehouse_worker(api, db_engine)
        product = api.entries[0].product_id
        await api.client.put(
            f"{ADMIN}/products/{product}/stock", json={"quantity": 11}, headers=mine.auth
        )
        await api.client.put(
            f"{ADMIN}/products/{product}/stock", json={"quantity": 12}, headers=other.auth
        )

        body = await board(api, mine)

        assert [(e["action"], e["data"]["quantity"]) for e in body["my_activity"]] == [
            ("product.stock", 11)
        ]


async def test_the_board_carries_no_revenue_or_customer_figures(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        body = await board(api, admin)

        assert not {"revenue_cents", "new_customers", "top_products"} & set(body)
