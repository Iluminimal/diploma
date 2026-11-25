"""Өмнөх захиалгыг сагсанд буцаах, мөн сагсны мөрийн үнийн snapshot."""

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.admin.test_admin_orders_api import in_stock, place_order
from tests.conftest import Api
from tests.support.commerce import Shopper, register, set_product, set_role

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ORDERS = "/api/v1/orders"
CART = "/api/v1/cart"


async def reorder(shopper: Shopper, number: str) -> dict[str, object]:
    response = await shopper.client.post(f"{ORDERS}/{number}/reorder", headers=shopper.auth)
    assert response.status_code == 200, response.text
    body: dict[str, object] = response.json()
    return body


async def bag(shopper: Shopper) -> list[dict[str, object]]:
    lines: list[dict[str, object]] = (await shopper.client.get(CART, headers=shopper.auth)).json()[
        "lines"
    ]
    return lines


async def test_the_items_of_an_order_go_back_in_the_bag_with_the_same_size_and_quantity(
    api: Api,
) -> None:
    product = in_stock(api)
    shopper, number = await place_order(api, product, pay=True)

    result = await reorder(shopper, number)

    assert (result["added"], result["skipped"]) == (1, [])
    (line,) = await bag(shopper)
    assert (line["quantity"], line["size"]) == (2, "M")
    assert line["product"]["id"] == product.product_id  # type: ignore[index]


async def test_reordering_twice_stops_at_the_stock_and_says_so(
    api: Api, db_engine: AsyncEngine
) -> None:
    product = in_stock(api)
    shopper, number = await place_order(api, product, pay=True)
    await set_product(db_engine, product.product_id, stock_quantity=3)

    await reorder(shopper, number)
    second = await reorder(shopper, number)

    assert second["skipped"] == [{"name": second["skipped"][0]["name"], "reason": "reduced"}]  # type: ignore[index]
    assert second["added"] == 1
    (line,) = await bag(shopper)
    assert line["quantity"] == 3


async def test_a_product_that_sold_out_is_listed_and_not_added(
    api: Api, db_engine: AsyncEngine
) -> None:
    product = in_stock(api)
    shopper, number = await place_order(api, product, pay=True)
    await set_product(db_engine, product.product_id, stock_quantity=0)

    result = await reorder(shopper, number)

    assert result["added"] == 0
    assert [s["reason"] for s in result["skipped"]] == ["out_of_stock"]  # type: ignore[attr-defined]
    assert await bag(shopper) == []


async def test_a_withdrawn_product_is_unavailable(api: Api, db_engine: AsyncEngine) -> None:
    product = in_stock(api)
    shopper, number = await place_order(api, product, pay=True)
    await set_product(db_engine, product.product_id, is_active=False)

    result = await reorder(shopper, number)

    assert [s["reason"] for s in result["skipped"]] == ["unavailable"]  # type: ignore[attr-defined]


async def test_only_your_own_orders_can_be_reordered(api: Api) -> None:
    _, number = await place_order(api, in_stock(api), pay=True)
    stranger = await register(api.client)

    response = await stranger.client.post(f"{ORDERS}/{number}/reorder", headers=stranger.auth)

    assert response.status_code == 404
    assert await bag(stranger) == []


async def test_signing_in_is_required(api: Api) -> None:
    _, number = await place_order(api, in_stock(api), pay=True)

    assert (await api.client.post(f"{ORDERS}/{number}/reorder")).status_code == 401


async def test_staff_do_not_shop(api: Api, db_engine: AsyncEngine) -> None:
    shopper, number = await place_order(api, in_stock(api), pay=True)
    await set_role(db_engine, shopper.user_id, "admin")

    response = await shopper.client.post(f"{ORDERS}/{number}/reorder", headers=shopper.auth)

    assert response.status_code == 403


async def test_a_line_remembers_the_price_it_was_added_at(api: Api, db_engine: AsyncEngine) -> None:
    product = in_stock(api)
    shopper, _ = await place_order(api, product)
    other = in_stock(api, 1)
    await shopper.client.post(
        f"{CART}/items",
        json={"product_id": other.product_id, "size": "M", "quantity": 1},
        headers=shopper.auth,
    )
    await set_product(db_engine, other.product_id, price_cents=other.price_cents + 700)

    (line,) = [
        ln
        for ln in await bag(shopper)
        if ln["product"]["id"] == other.product_id  # type: ignore[index]
    ]

    assert line["price_when_added_cents"] == other.price_cents
    assert line["unit_price_cents"] == other.price_cents + 700
