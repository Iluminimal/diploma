"""The admin's read-only view of every customer's orders."""

from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.catalogue import Entry
from tests.commerce import Shopper, add_address, add_to_cart, checkout, register, set_role
from tests.conftest import Api, ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ORDERS = "/api/v1/admin/orders"
ORDER_NOT_FOUND = "urn:angel:problem:order-not-found"


def in_stock(api: Api, skip: int = 0) -> Entry:
    return [e for e in api.entries if e.in_stock and e.article_type != "Casual Shoes"][skip]


async def place_order(api: Api, product: Entry, *, pay: bool = False) -> tuple[Shopper, str]:
    shopper = await register(api.client)
    await add_to_cart(shopper.client, product.product_id, quantity=2, token=shopper.token)
    address_id = await add_address(shopper)
    number = (await checkout(shopper, address_id)).json()["order"]["number"]
    if pay:
        response = await api.client.post(
            f"/api/v1/checkout/orders/{number}/simulate-payment", headers=shopper.auth
        )
        assert response.status_code == 200, response.text
    return shopper, number


async def administrator(api: Api, engine: AsyncEngine) -> Shopper:
    admin = await register(api.client)
    await set_role(engine, admin.user_id, "admin")
    return admin


@pytest.mark.parametrize("path", ["", "/LK-ABCD2345"])
async def test_only_administrators_can_read_orders(
    api_factory: ApiFactory, tmp_path: Path, path: str
) -> None:
    async with api_factory(seed_count=5, media_dir=tmp_path) as api:
        customer = await register(api.client)

        anonymous = await api.client.get(ORDERS + path)
        as_customer = await api.client.get(ORDERS + path, headers=customer.auth)

        assert anonymous.status_code == 401
        assert as_customer.status_code == 403


async def test_the_list_shows_every_customers_orders_newest_first(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        first_customer, first = await place_order(api, in_stock(api, 0), pay=True)
        second_customer, second = await place_order(api, in_stock(api, 1))

        response = await api.client.get(ORDERS, headers=admin.auth)

        body = response.json()
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"
        assert [o["number"] for o in body["items"]] == [second, first]
        assert body["total"] == 2
        newest, oldest = body["items"]
        assert (newest["status"], newest["payment_status"]) == ("pending", "requires_payment")
        assert (oldest["status"], oldest["payment_status"]) == ("paid", "succeeded")
        assert newest["customer_email"] == second_customer.email
        assert newest["customer_name"] == "Ada Lovelace"
        assert oldest["customer_email"] == first_customer.email
        assert oldest["item_count"] == 2
        assert oldest["total_cents"] > 0
        # A customer still sees only their own.
        own = (await api.client.get("/api/v1/orders", headers=first_customer.auth)).json()
        assert [o["number"] for o in own["items"]] == [first]


async def test_the_list_filters_by_status_and_searches_by_number_or_email(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        paid_customer, paid = await place_order(api, in_stock(api, 0), pay=True)
        _, pending = await place_order(api, in_stock(api, 1))
        _, cancelled = await place_order(api, in_stock(api, 2))
        async with db_engine.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE orders SET status = 'cancelled', cancelled_at = now(),"
                    " cancel_reason = 'expired' WHERE number = :n"
                ),
                {"n": cancelled},
            )

        async def numbers(**params: str) -> list[str]:
            response = await api.client.get(ORDERS, params=params, headers=admin.auth)
            assert response.status_code == 200, response.text
            return [o["number"] for o in response.json()["items"]]

        assert await numbers(status="paid") == [paid]
        assert await numbers(status="pending") == [pending]
        assert await numbers(status="cancelled") == [cancelled]
        assert len(await numbers(status="all")) == 3
        assert await numbers(q=pending[:7].lower()) == [pending]  # a prefix, any case
        assert await numbers(q=paid_customer.email.split("@")[0][-5:].upper()) == [paid]
        assert await numbers(q="%") == []
        assert await numbers(q="_") == []
        assert await numbers(q="nobody@nowhere") == []


async def test_the_list_paginates(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        placed = [(await place_order(api, in_stock(api, n)))[1] for n in range(3)]

        first = (await api.client.get(ORDERS, params={"page_size": 2}, headers=admin.auth)).json()
        second = (
            await api.client.get(ORDERS, params={"page_size": 2, "page": 2}, headers=admin.auth)
        ).json()

        assert (first["total"], first["pages"]) == (3, 2)
        assert [o["number"] for o in first["items"] + second["items"]] == placed[::-1]


async def test_an_order_shows_its_items_address_and_payment_but_never_the_client_secret(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        product = in_stock(api)
        customer, number = await place_order(api, product, pay=True)

        response = await api.client.get(f"{ORDERS}/{number}", headers=admin.auth)

        body = response.json()
        assert response.status_code == 200, response.text
        assert body["number"] == number
        assert body["status"] == "paid"
        assert body["user_id"] == customer.user_id
        assert body["contact_email"] == customer.email
        assert body["shipping_address"]["city"] == "London"
        [item] = body["items"]
        assert (item["product_id"], item["quantity"]) == (product.product_id, 2)
        assert item["unit_price_cents"] == product.price_cents
        assert body["payment"]["provider"] == "offline"
        assert body["payment"]["status"] == "succeeded"
        assert body["payment"]["amount_cents"] == body["total_cents"]
        assert "client_secret" not in response.text
        assert body["cancel_reason"] is None


async def test_a_cancelled_order_says_why(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)
        _, number = await place_order(api, in_stock(api))
        async with db_engine.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE orders SET status = 'cancelled', cancelled_at = now(),"
                    " cancel_reason = 'expired' WHERE number = :n"
                ),
                {"n": number},
            )

        body = (await api.client.get(f"{ORDERS}/{number}", headers=admin.auth)).json()

        assert body["status"] == "cancelled"
        assert body["cancel_reason"] == "expired"
        assert body["cancelled_at"]


async def test_an_unknown_order_is_a_404(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> None:
    async with api_factory(seed_count=5, media_dir=tmp_path) as api:
        admin = await administrator(api, db_engine)

        response = await api.client.get(f"{ORDERS}/LK-ABCD2345", headers=admin.auth)

        assert response.status_code == 404
        assert response.json()["type"] == ORDER_NOT_FOUND
