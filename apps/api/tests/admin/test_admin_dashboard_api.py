"""Dashboard-ийн тоо, хэрэглэгчдийн жагсаалт, хэрэглэгчийг түдгэлзүүлэх, нөөцийн тоо."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.admin.test_admin_orders_api import administrator, in_stock, place_order, warehouse_worker
from tests.conftest import Api, ApiFactory
from tests.support.commerce import (
    PASSWORD,
    Shopper,
    another_client,
    register,
    set_product,
    set_role,
    stock_of,
)
from tests.support.fakes import RecordingGateway

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ADMIN = "/api/v1/admin"
SHIP = {"carrier": "DHL", "tracking_number": "JD0146"}
ORDER_TOTAL = 502_200  # 1100-ийн хоёр бараа ба 500,000 (5,000 ₮) энгийн хүргэлт


async def stats(api: Api, admin: Shopper, **params: Any) -> dict[str, Any]:
    response = await api.client.get(f"{ADMIN}/stats", params=params, headers=admin.auth)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def backdate_payment(engine: AsyncEngine, number: str, days: int) -> None:
    async with engine.begin() as connection:
        await connection.execute(
            text(
                "UPDATE orders SET paid_at = now() - make_interval(days => :d), "
                "created_at = now() - make_interval(days => :d) WHERE number = :n"
            ),
            {"d": days, "n": number},
        )


# --- Хандалт ----------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/stats"),
        ("GET", "/customers"),
        ("GET", "/customers/1"),
        ("POST", "/customers/1/deactivate"),
        ("POST", "/customers/1/activate"),
        ("PUT", "/products/1/stock"),
        ("GET", "/fulfillment"),
        ("GET", "/audit"),
        ("GET", "/export/stats"),
        ("GET", "/export/orders"),
    ],
)
async def test_only_administrators_get_in(
    api_factory: ApiFactory, tmp_path: Path, method: str, path: str
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        customer = await register(api.client)

        anonymous = await api.client.request(method, ADMIN + path, json={"quantity": 1})
        as_customer = await api.client.request(
            method, ADMIN + path, json={"quantity": 1}, headers=customer.auth
        )

        assert (anonymous.status_code, as_customer.status_code) == (401, 403)


@pytest.mark.parametrize(
    ("method", "path", "role", "status"),
    [
        ("GET", "/stats", "warehouse", 403),
        ("GET", "/customers", "warehouse", 403),
        ("POST", "/customers/1/deactivate", "warehouse", 403),
        ("GET", "/reviews", "warehouse", 403),
        ("POST", "/reviews/1/hide", "warehouse", 403),
        ("GET", "/audit", "warehouse", 403),
        ("GET", "/export/stats", "warehouse", 403),
        ("GET", "/export/orders", "warehouse", 403),
        ("GET", "/fulfillment", "warehouse", 200),
        ("GET", "/fulfillment", "admin", 200),
        ("PUT", "/products/1/stock", "admin", 403),
        ("GET", "/stats", "admin", 200),
        ("GET", "/reviews", "admin", 200),
        ("GET", "/audit", "admin", 200),
        ("GET", "/export/stats", "admin", 200),
        ("GET", "/export/orders", "admin", 200),
    ],
)
async def test_each_staff_role_only_reaches_its_own_sections(
    api_factory: ApiFactory,
    db_engine: AsyncEngine,
    tmp_path: Path,
    method: str,
    path: str,
    role: str,
    status: int,
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        staff = await register(api.client)
        await set_role(db_engine, staff.user_id, role)

        response = await api.client.request(
            method, ADMIN + path, json={"quantity": 1}, headers=staff.auth
        )

        assert response.status_code == status, response.text


# --- Самбар --------------------------------------------------------------------------------


async def test_the_figures_count_what_was_paid_and_leave_out_refunds(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path, gateway=RecordingGateway()) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        _, shipped = await place_order(api, in_stock(api, 0), pay=True)
        _, refunded = await place_order(api, in_stock(api, 1), pay=True)
        _, waiting = await place_order(api, in_stock(api, 2), pay=False)
        _, last_period = await place_order(api, in_stock(api, 3), pay=True)
        await api.client.post(f"{ADMIN}/orders/{shipped}/ship", json=SHIP, headers=worker.auth)
        await api.client.post(
            f"{ADMIN}/orders/{refunded}/refund",
            json={"reason": "x", "restock": False},
            headers=admin.auth,
        )
        await backdate_payment(db_engine, last_period, 40)
        earlier = await api.client.get(f"{ADMIN}/orders/{last_period}", headers=admin.auth)
        earlier_total = earlier.json()["total_cents"]

        body = await stats(api, admin, days=30)

        assert body["revenue_cents"] == {"current": ORDER_TOTAL, "previous": earlier_total}
        assert body["orders"] == {"current": 1, "previous": 1}
        assert body["units"] == {"current": 2, "previous": 2}
        assert body["average_order_cents"] == {"current": ORDER_TOTAL, "previous": earlier_total}
        assert body["status_counts"] == {"shipped": 1, "refunded": 1, "pending": 1, "paid": 1}
        assert (body["to_ship"], body["awaiting_payment"]) == (1, 1)
        assert body["currency"] == "MNT"
        assert len(body["series"]) == 30
        assert sum(p["revenue_cents"] for p in body["series"]) == ORDER_TOTAL
        assert body["series"][-1] == {
            "date": body["series"][-1]["date"],
            "revenue_cents": ORDER_TOTAL,
            "orders": 1,
            "units": 2,
            "new_customers": body["series"][-1]["new_customers"],
        }
        assert [t["revenue_cents"] for t in body["top_products"]] == [2200]
        assert body["top_products"][0]["units"] == 2
        assert [o["number"] for o in body["recent_orders"]] == [
            waiting,
            refunded,
            shipped,
            last_period,
        ]


async def test_an_empty_shop_has_zeros_not_errors(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        body = await stats(api, admin, days=7)

        assert body["revenue_cents"] == {"current": 0, "previous": 0}
        assert body["average_order_cents"] == {"current": 0, "previous": 0}
        assert [p["orders"] for p in body["series"]] == [0] * 7
        assert body["top_products"] == []
        assert body["recent_orders"] == []


@pytest.mark.parametrize("days", [0, 367, "x"])
async def test_the_period_is_bounded(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path, days: int | str
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        response = await api.client.get(f"{ADMIN}/stats", params={"days": days}, headers=admin.auth)

        assert response.status_code == 422


async def test_the_funnel_categories_and_ops_figures_follow_the_orders(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path, gateway=RecordingGateway()) as api:
        admin = await administrator(api, db_engine)
        worker = await warehouse_worker(api, db_engine)
        _, shipped = await place_order(api, in_stock(api, 0), pay=True)
        _, refunded = await place_order(api, in_stock(api, 1), pay=True)
        await place_order(api, in_stock(api, 2), pay=False)
        await api.client.post(f"{ADMIN}/orders/{shipped}/ship", json=SHIP, headers=worker.auth)
        await api.client.post(
            f"{ADMIN}/orders/{refunded}/refund",
            json={"reason": "x", "restock": False},
            headers=admin.auth,
        )

        body = await stats(api, admin, days=30)

        assert body["funnel"] == {
            "created": 3,
            "paid": 2,
            "shipped": 1,
            "delivered": 0,
            "cancelled": 0,
            "refunded": 1,
        }
        assert [(c["revenue_cents"], c["units"]) for c in body["by_category"]] == [(2200, 2)]
        assert body["by_category"][0]["name"]
        assert body["refund_rate"] == 0.5
        assert body["cancel_rate"] == 0.0
        assert body["repeat_customer_rate"] == 0.0
        assert body["avg_ship_hours"] is not None
        assert body["avg_ship_hours"] >= 0
        assert (body["overdue_to_ship"], body["ship_sla_hours"]) == (0, 24)


async def test_an_empty_period_has_no_rates_rather_than_zeros(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        body = await stats(api, admin, days=7)

        assert body["funnel"]["created"] == 0
        assert body["by_category"] == []
        assert (body["refund_rate"], body["cancel_rate"], body["repeat_customer_rate"]) == (
            None,
            None,
            None,
        )
        assert body["avg_ship_hours"] is None


async def test_a_custom_period_is_counted_in_whole_days(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path, gateway=RecordingGateway()) as api:
        admin = await administrator(api, db_engine)
        _, number = await place_order(api, in_stock(api, 0), pay=True)
        await backdate_payment(db_engine, number, 10)
        today = datetime.now(UTC).date()
        start, end = today - timedelta(days=12), today - timedelta(days=8)

        body = await stats(api, admin, start=start.isoformat(), end=end.isoformat())

        assert (body["days"], body["start"], body["end"]) == (5, start.isoformat(), end.isoformat())
        assert len(body["series"]) == 5
        assert body["revenue_cents"]["current"] == ORDER_TOTAL
        assert body["revenue_cents"]["previous"] == 0


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2026-01-01"},
        {"end": "2026-01-01"},
        {"start": "2026-02-01", "end": "2026-01-01"},
        {"start": "2024-01-01", "end": "2026-01-01"},
        {"start": "2026-01-01", "end": "2999-01-01"},
        {"start": "not-a-date", "end": "2026-01-01"},
    ],
)
async def test_a_custom_period_must_be_complete_ordered_in_the_past_and_a_year_at_most(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path, params: dict[str, str]
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        response = await api.client.get(f"{ADMIN}/stats", params=params, headers=admin.auth)

        assert response.status_code == 422


async def test_new_customers_exclude_staff_and_the_period_follows_the_days_asked(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        await register(api.client)
        old = await register(api.client)
        async with db_engine.begin() as connection:
            await connection.execute(
                text("UPDATE users SET created_at = now() - interval '10 days' WHERE id = :i"),
                {"i": old.user_id},
            )

        week = await stats(api, admin, days=7)
        month = await stats(api, admin, days=30)

        assert week["new_customers"] == {"current": 1, "previous": 1}
        assert month["new_customers"] == {"current": 2, "previous": 0}


async def test_low_and_out_of_stock_products_are_listed_for_the_dashboard(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=6, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        ids = [e.product_id for e in api.entries[:4]]
        await set_product(db_engine, ids[0], stock_quantity=2)
        await set_product(db_engine, ids[1], stock_quantity=5)
        await set_product(db_engine, ids[2], stock_quantity=0)
        await set_product(db_engine, ids[3], stock_quantity=6)

        body = await stats(api, admin)

        assert body["low_stock_threshold"] == 5
        assert [p["id"] for p in body["low_stock"]] == [ids[0], ids[1]]
        assert body["low_stock_total"] >= 2
        assert body["out_of_stock_total"] >= 1


# --- Нөөц -------------------------------------------------------------------------------------


async def test_stock_is_set_and_shows_in_the_product_and_the_stock_filters(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=6, media_dir=tmp_path) as api:
        worker = await warehouse_worker(api, db_engine)
        first, second = api.entries[0].product_id, api.entries[1].product_id

        response = await api.client.put(
            f"{ADMIN}/products/{first}/stock", json={"quantity": 3}, headers=worker.auth
        )
        await api.client.put(
            f"{ADMIN}/products/{second}/stock", json={"quantity": 0}, headers=worker.auth
        )

        assert response.status_code == 200, response.text
        assert response.json()["stock_quantity"] == 3
        assert await stock_of(db_engine, first) == 3
        low = await api.client.get(
            f"{ADMIN}/products", params={"stock": "low"}, headers=worker.auth
        )
        out = await api.client.get(
            f"{ADMIN}/products", params={"stock": "out"}, headers=worker.auth
        )
        assert first in [p["id"] for p in low.json()["items"]]
        assert second not in [p["id"] for p in low.json()["items"]]
        assert second in [p["id"] for p in out.json()["items"]]


@pytest.mark.parametrize("quantity", [-1, 100_001, 1.5, "x", None])
async def test_stock_must_be_a_whole_number_in_range(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path, quantity: object
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        worker = await warehouse_worker(api, db_engine)
        product = api.entries[0].product_id
        before = await stock_of(db_engine, product)

        response = await api.client.put(
            f"{ADMIN}/products/{product}/stock", json={"quantity": quantity}, headers=worker.auth
        )

        assert response.status_code == 422
        assert await stock_of(db_engine, product) == before


async def test_stock_of_an_unknown_product_is_a_404(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        worker = await warehouse_worker(api, db_engine)

        response = await api.client.put(
            f"{ADMIN}/products/999999/stock", json={"quantity": 1}, headers=worker.auth
        )

        assert response.status_code == 404


# --- Хэрэглэгчид ------------------------------------------------------------------------------


async def test_customers_show_what_they_have_bought(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path, gateway=RecordingGateway()) as api:
        admin = await administrator(api, db_engine)
        buyer, number = await place_order(api, in_stock(api, 0), pay=True)
        browser = await register(api.client)
        refunded_buyer, refunded = await place_order(api, in_stock(api, 1), pay=True)
        await api.client.post(
            f"{ADMIN}/orders/{refunded}/refund",
            json={"reason": "x", "restock": False},
            headers=admin.auth,
        )

        response = await api.client.get(f"{ADMIN}/customers", headers=admin.auth)

        rows = {c["id"]: c for c in response.json()["items"]}
        assert response.status_code == 200
        assert admin.user_id not in rows
        assert rows[buyer.user_id]["orders_count"] == 1
        assert rows[buyer.user_id]["total_spent_cents"] == ORDER_TOTAL
        assert rows[browser.user_id]["orders_count"] == 0
        assert rows[browser.user_id]["last_order_at"] is None
        # Буцаан олгосон захиалга худалдан авагдсан ч мөнгө нь зарцуулагдаагүй.
        assert rows[refunded_buyer.user_id]["orders_count"] == 1
        assert rows[refunded_buyer.user_id]["total_spent_cents"] == 0
        assert number


async def test_customers_can_be_searched_filtered_and_sorted(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        big, _ = await place_order(api, in_stock(api, 0), pay=True)
        small = await register(api.client, "zed.small@example.com")
        await api.client.post(f"{ADMIN}/customers/{small.user_id}/deactivate", headers=admin.auth)

        by_email = await api.client.get(
            f"{ADMIN}/customers", params={"q": "ZED.small"}, headers=admin.auth
        )
        inactive = await api.client.get(
            f"{ADMIN}/customers", params={"status": "inactive"}, headers=admin.auth
        )
        by_spend = await api.client.get(
            f"{ADMIN}/customers", params={"sort": "spent"}, headers=admin.auth
        )
        wildcard = await api.client.get(f"{ADMIN}/customers", params={"q": "%"}, headers=admin.auth)

        assert [c["id"] for c in by_email.json()["items"]] == [small.user_id]
        assert [c["id"] for c in inactive.json()["items"]] == [small.user_id]
        assert by_spend.json()["items"][0]["id"] == big.user_id
        assert wildcard.json()["total"] == 0


async def test_a_customer_page_has_their_orders_and_how_they_sign_in(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        customer, number = await place_order(api, in_stock(api, 0), pay=True)

        response = await api.client.get(f"{ADMIN}/customers/{customer.user_id}", headers=admin.auth)

        body = response.json()
        assert response.status_code == 200, response.text
        assert body["email"] == customer.email
        assert body["has_password"] is True
        assert body["providers"] == []
        assert [o["number"] for o in body["recent_orders"]] == [number]
        assert "password" not in response.text.replace("has_password", "")


async def test_staff_and_unknown_accounts_are_not_customers(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        as_staff = await api.client.get(f"{ADMIN}/customers/{admin.user_id}", headers=admin.auth)
        unknown = await api.client.get(f"{ADMIN}/customers/99999", headers=admin.auth)

        assert (as_staff.status_code, unknown.status_code) == (404, 404)


async def test_a_suspended_customer_cannot_sign_in_or_keep_a_session_and_can_be_reinstated(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        customer = await register(api.client, "suspend.me@example.com")
        refresh = customer.client.cookies.get("lk_refresh", path="/api/v1/auth")
        assert refresh

        response = await api.client.post(
            f"{ADMIN}/customers/{customer.user_id}/deactivate", headers=admin.auth
        )

        assert response.status_code == 200, response.text
        assert response.json()["is_active"] is False
        async with another_client(api) as browser:
            login = await browser.post(
                "/api/v1/auth/login",
                json={"email": "suspend.me@example.com", "password": PASSWORD},
            )
            assert login.status_code == 401
        async with another_client(api, refresh_token=refresh) as browser:
            assert (await browser.post("/api/v1/auth/refresh")).status_code == 401
        assert (await api.client.get("/api/v1/auth/me", headers=customer.auth)).status_code == 401

        again = await api.client.post(
            f"{ADMIN}/customers/{customer.user_id}/activate", headers=admin.auth
        )

        assert again.json()["is_active"] is True
        async with another_client(api) as browser:
            login = await browser.post(
                "/api/v1/auth/login",
                json={"email": "suspend.me@example.com", "password": PASSWORD},
            )
            assert login.status_code == 200


async def test_you_cannot_suspend_yourself_or_another_administrator(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        other = await administrator(api, db_engine)

        worker = await warehouse_worker(api, db_engine)
        yourself = await api.client.post(
            f"{ADMIN}/customers/{admin.user_id}/deactivate", headers=admin.auth
        )
        warehouse = await api.client.post(
            f"{ADMIN}/customers/{worker.user_id}/deactivate", headers=admin.auth
        )
        colleague = await api.client.post(
            f"{ADMIN}/customers/{other.user_id}/deactivate", headers=admin.auth
        )
        unknown = await api.client.post(f"{ADMIN}/customers/99999/deactivate", headers=admin.auth)

        assert (yourself.status_code, colleague.status_code, unknown.status_code) == (403, 403, 404)
        assert warehouse.status_code == 403
        assert (await api.client.get("/api/v1/auth/me", headers=worker.auth)).status_code == 200
        assert (await api.client.get("/api/v1/auth/me", headers=other.auth)).status_code == 200
