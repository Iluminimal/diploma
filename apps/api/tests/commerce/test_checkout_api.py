import asyncio
import contextlib
import uuid

import pytest
from sqlalchemy import text

from tests.conftest import Api, ApiFactory
from tests.support.accounts import install_sms, sign_in_with_phone
from tests.support.catalogue import Entry
from tests.support.commerce import (
    PASSWORD,
    Shopper,
    add_address,
    add_to_cart,
    another_client,
    checkout,
    register,
    set_product,
    stock_of,
    unique_email,
)
from tests.support.fakes import RecordingGateway, RecordingMailer

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

CHECKOUT = "/api/v1/checkout"
ORDERS = "/api/v1/orders"


def in_stock(api: Api, skip: int = 0) -> Entry:
    return [e for e in api.entries if e.in_stock and e.article_type != "Casual Shoes"][skip]


async def shopper_with_cart(
    api: Api, product: Entry, *, quantity: int = 2, size: str = "M"
) -> tuple[Shopper, int]:
    """A signed-in shopper with `product` in their cart and an address; returns the address id."""
    shopper = await register(api.client)
    await add_to_cart(
        shopper.client, product.product_id, size=size, quantity=quantity, token=shopper.token
    )
    return shopper, await add_address(shopper)


async def orders_in_db(api: Api, **where: str | int) -> list[dict[str, object]]:
    clause = " AND ".join(f"{column} = :{column}" for column in where) or "TRUE"
    async with api.app.state.engine.connect() as connection:
        rows = await connection.execute(
            text(f"SELECT * FROM orders WHERE {clause} ORDER BY id"),  # noqa: S608
            where,
        )
        return [dict(row._mapping) for row in rows]


@pytest.fixture
def gateway() -> RecordingGateway:
    return RecordingGateway("whsec_test_secret")


async def test_checkout_reserves_stock_snapshots_prices_and_starts_the_payment(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=2)

        response = await checkout(shopper, address_id)

        body = response.json()
        order = body["order"]
        assert response.status_code == 200, response.text
        assert order["status"] == "pending"
        assert order["number"].startswith("LK-")
        assert len(order["number"]) == 11
        [item] = order["items"]
        assert (item["product_id"], item["size"], item["quantity"]) == (product.product_id, "M", 2)
        assert item["unit_price_cents"] == product.price_cents
        assert order["subtotal_cents"] == 2 * product.price_cents
        assert order["shipping_cents"] == api.settings.shipping_standard_cents
        assert order["total_cents"] == order["subtotal_cents"] + order["shipping_cents"]
        assert order["shipping_address"]["line1"] == "12 Analytical Way"
        assert order["contact_email"] == shopper.email
        assert body["payment"]["provider"] == "offline"
        assert body["payment"]["client_secret"]
        assert gateway.created == [
            {
                "amount": order["total_cents"],
                "order": order["number"],
                "key": gateway.created[0]["key"],
            }
        ]
        assert await stock_of(api.app.state.engine, product.product_id) == 7 - 2
        # The cart stays until the payment succeeds: a declined card must not cost the basket.
        cart = await shopper.client.get("/api/v1/cart", headers=shopper.auth)
        assert cart.json()["item_count"] == 2


async def test_shipping_cost_depends_on_the_method_and_the_subtotal(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        cheap, pricey = in_stock(api), in_stock(api, 1)
        await set_product(api.app.state.engine, pricey.product_id, price_cents=6000)
        shopper, address_id = await shopper_with_cart(api, cheap, quantity=1)
        await add_to_cart(shopper.client, pricey.product_id, quantity=2, token=shopper.token)

        express = (await checkout(shopper, address_id, method="express")).json()["order"]
        standard = (await checkout(shopper, address_id, method="standard")).json()["order"]

        assert express["shipping_cents"] == api.settings.shipping_express_cents
        assert standard["subtotal_cents"] >= api.settings.free_shipping_threshold_cents
        assert standard["shipping_cents"] == 0  # free over the threshold
        assert standard["total_cents"] == standard["subtotal_cents"]


async def test_shipping_methods_endpoint(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        response = await api.client.get(f"{CHECKOUT}/shipping-methods")

        body = response.json()
        assert response.status_code == 200
        assert [m["id"] for m in body["items"]] == ["standard", "express"]
        assert body["items"][0]["price_cents"] == 499
        assert body["free_shipping_threshold_cents"] == 10_000


async def test_checkout_input_and_authentication(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api, in_stock(api))
        key = {"Idempotency-Key": uuid.uuid4().hex}
        body = {"address_id": address_id, "shipping_method": "standard"}

        anonymous = await api.client.post(CHECKOUT, json=body, headers=key)
        no_key = await api.client.post(CHECKOUT, json=body, headers=shopper.auth)
        short_key = await api.client.post(
            CHECKOUT, json=body, headers={**shopper.auth, "Idempotency-Key": "x"}
        )
        weird_key = await api.client.post(
            CHECKOUT, json=body, headers={**shopper.auth, "Idempotency-Key": "a b c d e f g h"}
        )
        bad_method = await api.client.post(
            CHECKOUT,
            json={**body, "shipping_method": "teleport"},
            headers={**shopper.auth, **key},
        )
        client_price = await api.client.post(
            CHECKOUT, json={**body, "total_cents": 1}, headers={**shopper.auth, **key}
        )

        assert anonymous.status_code == 401
        assert {
            r.status_code for r in (no_key, short_key, weird_key, bad_method, client_price)
        } == {422}
        assert gateway.created == []


async def test_empty_cart_and_foreign_or_unknown_address_are_rejected(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper = await register(api.client)
        address_id = await add_address(shopper)
        empty = await checkout(shopper, address_id)
        async with another_client(api) as browser:
            other = await register(browser)
            others_address = await add_address(other)
        await add_to_cart(api.client, in_stock(api).product_id, token=shopper.token)

        foreign = await checkout(shopper, others_address)
        unknown = await checkout(shopper, 999_999)

        assert empty.status_code == 409
        assert empty.json()["type"] == "urn:angel:problem:cart-empty"
        assert foreign.status_code == unknown.status_code == 404
        assert await orders_in_db(api) == []


async def test_items_that_ran_out_stop_checkout_and_nothing_is_reserved(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        fine, shrinking, withdrawn = in_stock(api), in_stock(api, 1), in_stock(api, 2)
        shopper, address_id = await shopper_with_cart(api, fine, quantity=1)
        await add_to_cart(api.client, shrinking.product_id, quantity=5, token=shopper.token)
        await add_to_cart(api.client, withdrawn.product_id, quantity=1, token=shopper.token)
        await set_product(api.app.state.engine, shrinking.product_id, stock_quantity=3)
        await set_product(api.app.state.engine, withdrawn.product_id, is_active=False)

        response = await checkout(shopper, address_id)

        assert response.status_code == 409
        assert response.json()["type"] == "urn:angel:problem:insufficient-stock"
        issues = {i["product_id"]: i["available"] for i in response.json()["issues"]}
        assert issues == {shrinking.product_id: 3, withdrawn.product_id: 0}
        assert await stock_of(api.app.state.engine, fine.product_id) == 7  # nothing reserved
        assert await orders_in_db(api) == []


async def test_the_same_product_in_two_sizes_is_checked_against_stock_as_a_whole(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=4, size="M")
        await add_to_cart(api.client, product.product_id, size="L", quantity=3, token=shopper.token)
        await set_product(api.app.state.engine, product.product_id, stock_quantity=6)

        response = await checkout(shopper, address_id)

        assert response.status_code == 409
        assert response.json()["issues"] == [{"product_id": product.product_id, "available": 6}]


async def test_repeating_a_request_with_the_same_key_returns_the_same_order(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=2)

        first = await checkout(shopper, address_id, key="attempt-0001")
        second = await checkout(shopper, address_id, key="attempt-0001")

        assert first.status_code == second.status_code == 200
        assert first.json() == second.json()
        assert len(await orders_in_db(api)) == 1
        assert len(gateway.created) == 1
        assert await stock_of(api.app.state.engine, product.product_id) == 5  # reserved once


async def test_parallel_requests_with_one_key_create_one_order_and_one_payment(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=2)

        responses = await asyncio.gather(
            *(checkout(shopper, address_id, key="double-click-1") for _ in range(5))
        )

        assert {r.status_code for r in responses} == {200}
        assert len({r.json()["order"]["number"] for r in responses}) == 1
        assert len({r.json()["payment"]["client_secret"] for r in responses}) == 1
        assert len(await orders_in_db(api)) == 1
        assert await stock_of(api.app.state.engine, product.product_id) == 5


async def test_a_replay_finishes_a_checkout_that_died_before_the_payment_was_stored(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api, in_stock(api))
        first = await checkout(shopper, address_id, key="attempt-0002")
        async with api.app.state.engine.begin() as connection:
            await connection.execute(text("DELETE FROM payments"))  # the crash

        replay = await checkout(shopper, address_id, key="attempt-0002")

        assert replay.status_code == 200
        assert replay.json()["order"]["number"] == first.json()["order"]["number"]
        assert replay.json()["payment"]["client_secret"]
        assert len(await orders_in_db(api)) == 1


async def test_a_payment_provider_outage_gives_the_stock_back_and_can_be_retried(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=2)
        gateway.fail_create = True

        failed = await checkout(shopper, address_id)

        assert failed.status_code == 502
        assert failed.json()["type"] == "urn:angel:problem:payment-provider-error"
        assert await stock_of(api.app.state.engine, product.product_id) == 7
        [order] = await orders_in_db(api)
        assert (order["status"], order["cancel_reason"]) == ("cancelled", "payment_setup_failed")
        gateway.fail_create = False
        retried = await checkout(shopper, address_id)  # a new attempt, a new key
        assert retried.status_code == 200
        assert await stock_of(api.app.state.engine, product.product_id) == 5


async def test_a_new_checkout_replaces_the_unpaid_one_and_releases_its_stock(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=3)
        first = (await checkout(shopper, address_id)).json()["order"]

        second = (await checkout(shopper, address_id, method="express")).json()["order"]

        assert second["number"] != first["number"]
        assert len(gateway.cancelled) == 1  # the first payment can no longer be paid
        states = {o["number"]: (o["status"], o["cancel_reason"]) for o in await orders_in_db(api)}
        assert states[first["number"]] == ("cancelled", "replaced")
        assert states[second["number"]][0] == "pending"
        assert await stock_of(api.app.state.engine, product.product_id) == 7 - 3  # not 7 - 6


async def test_if_the_old_payment_went_through_meanwhile_no_second_order_is_made(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product)
        await checkout(shopper, address_id)
        gateway.cancel_outcome = "succeeded"

        response = await checkout(shopper, address_id)

        assert response.status_code == 409
        assert response.json()["type"] == "urn:angel:problem:payment-in-progress"
        assert len(await orders_in_db(api)) == 1


async def test_if_the_old_payment_cannot_be_cancelled_nothing_changes(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=2)
        await checkout(shopper, address_id)
        gateway.fail_cancel = True

        response = await checkout(shopper, address_id)

        assert response.status_code == 502
        orders = await orders_in_db(api)
        assert [o["status"] for o in orders] == ["pending"]
        assert await stock_of(api.app.state.engine, product.product_id) == 5


async def test_two_buyers_racing_for_the_last_unit_exactly_one_wins(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        await set_product(api.app.state.engine, product.product_id, stock_quantity=1)
        async with contextlib.AsyncExitStack() as stack:
            buyers: list[tuple[Shopper, int]] = []
            for _ in range(6):
                browser = await stack.enter_async_context(another_client(api))
                shopper = await register(browser)
                await add_to_cart(browser, product.product_id, quantity=1, token=shopper.token)
                buyers.append((shopper, await add_address(shopper)))

            responses = await asyncio.gather(*(checkout(s, a) for s, a in buyers))

        assert sorted(r.status_code for r in responses) == [200] + [409] * 5
        assert await stock_of(api.app.state.engine, product.product_id) == 0
        assert len(await orders_in_db(api)) == 1


async def test_parallel_checkouts_with_different_keys_never_reserve_stock_twice(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=3)

        responses = await asyncio.gather(*(checkout(shopper, address_id) for _ in range(4)))

        assert {r.status_code for r in responses} <= {200}
        pending = await orders_in_db(api, status="pending")
        assert len(pending) == 1
        assert await stock_of(api.app.state.engine, product.product_id) == 7 - 3


async def test_the_order_keeps_the_price_and_name_it_was_bought_at(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=1)
        placed = (await checkout(shopper, address_id)).json()["order"]

        await set_product(
            api.app.state.engine, product.product_id, price_cents=99_999, name="Renamed"
        )
        shown = await shopper.client.get(f"{ORDERS}/{placed['number']}", headers=shopper.auth)

        item = shown.json()["items"][0]
        assert item["unit_price_cents"] == product.price_cents
        assert item["name"] != "Renamed"
        assert shown.json()["total_cents"] == placed["total_cents"]


async def test_the_order_keeps_the_address_it_was_shipped_to(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api, in_stock(api))
        placed = (await checkout(shopper, address_id)).json()["order"]

        await api.client.patch(
            f"/api/v1/addresses/{address_id}", json={"city": "Elsewhere"}, headers=shopper.auth
        )
        await api.client.delete(f"/api/v1/addresses/{address_id}", headers=shopper.auth)
        shown = await api.client.get(f"{ORDERS}/{placed['number']}", headers=shopper.auth)

        assert shown.json()["shipping_address"]["city"] == "London"


async def test_offline_payment_completes_the_order_and_clears_only_what_was_bought(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        bought, later = in_stock(api), in_stock(api, 1)
        shopper, address_id = await shopper_with_cart(api, bought, quantity=2)
        number = (await checkout(shopper, address_id)).json()["order"]["number"]
        await add_to_cart(api.client, later.product_id, quantity=1, token=shopper.token)

        paid = await api.client.post(
            f"{CHECKOUT}/orders/{number}/simulate-payment", headers=shopper.auth
        )
        again = await api.client.post(
            f"{CHECKOUT}/orders/{number}/simulate-payment", headers=shopper.auth
        )

        assert paid.status_code == again.status_code == 200
        assert paid.json()["status"] == "paid"
        assert paid.json()["paid_at"]
        cart = (await api.client.get("/api/v1/cart", headers=shopper.auth)).json()
        assert [line["product"]["id"] for line in cart["lines"]] == [later.product_id]
        assert await stock_of(api.app.state.engine, bought.product_id) == 5
        confirmations = [m for m in mailer.sent if "confirmed" in m.subject]
        assert [m.subject for m in confirmations] == [f"Order {number} confirmed"]  # sent once
        assert confirmations[0].to == shopper.email


async def test_simulated_payment_only_exists_in_offline_mode_and_for_your_own_orders(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api, in_stock(api))
        number = (await checkout(shopper, address_id)).json()["order"]["number"]
        async with another_client(api) as browser:
            stranger = await register(browser)
            foreign = await browser.post(
                f"{CHECKOUT}/orders/{number}/simulate-payment", headers=stranger.auth
            )
        gateway.mode = "stripe"

        live = await api.client.post(
            f"{CHECKOUT}/orders/{number}/simulate-payment", headers=shopper.auth
        )

        assert foreign.status_code == 404  # offline at the time, but not theirs
        assert live.status_code == 404  # a real gateway: no shortcut


async def test_without_payment_configuration_checkout_is_unavailable_but_the_shop_works(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(payments_mode="stripe", stripe_secret_key="") as api:
        shopper, address_id = await shopper_with_cart(api, in_stock(api))

        response = await checkout(shopper, address_id)

        assert response.status_code == 503
        assert response.json()["type"] == "urn:angel:problem:payments-unavailable"
        assert (await api.client.get("/api/v1/cart", headers=shopper.auth)).status_code == 200
        assert (await api.client.get("/readyz")).status_code in (200, 503)


# --- order history ---------------------------------------------------------------------------


async def test_order_history_is_paginated_newest_first_and_private(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = in_stock(api)
        shopper, address_id = await shopper_with_cart(api, product, quantity=1)
        numbers = []
        for _ in range(3):
            number = (await checkout(shopper, address_id)).json()["order"]["number"]
            await api.client.post(
                f"{CHECKOUT}/orders/{number}/simulate-payment", headers=shopper.auth
            )
            numbers.append(number)
            await add_to_cart(api.client, product.product_id, token=shopper.token)

        page1 = (await api.client.get(f"{ORDERS}?page_size=2", headers=shopper.auth)).json()
        page2 = (await api.client.get(f"{ORDERS}?page_size=2&page=2", headers=shopper.auth)).json()
        async with another_client(api) as browser:
            stranger = await register(browser)
            foreign_detail = await browser.get(f"{ORDERS}/{numbers[0]}", headers=stranger.auth)
            foreign_list = await browser.get(ORDERS, headers=stranger.auth)

        assert [o["number"] for o in page1["items"]] == [numbers[2], numbers[1]]
        assert [o["number"] for o in page2["items"]] == [numbers[0]]
        assert (page1["total"], page1["pages"]) == (3, 2)
        assert page1["items"][0]["item_count"] == 1
        assert page1["items"][0]["images"][0]["thumb_400"]
        assert foreign_detail.status_code == 404
        assert foreign_detail.json()["type"] == "urn:angel:problem:order-not-found"
        assert foreign_list.json()["items"] == []
        assert (
            await api.client.get(f"{ORDERS}/LK-NOSUCH00", headers=shopper.auth)
        ).status_code == 404


async def test_login_from_another_browser_sees_the_same_orders(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        email = unique_email()
        async with another_client(api) as desktop:
            shopper = await register(desktop, email)
            await add_to_cart(desktop, in_stock(api).product_id, token=shopper.token)
            address_id = await add_address(shopper)
            number = (await checkout(shopper, address_id)).json()["order"]["number"]

        login = await api.client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
        )
        token = login.json()["access_token"]
        listing = await api.client.get(ORDERS, headers={"Authorization": f"Bearer {token}"})

        assert [o["number"] for o in listing.json()["items"]] == [number]


async def test_a_customer_who_signed_up_with_a_phone_gives_an_email_for_the_order(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        sms = install_sms(api)
        shopper = await sign_in_with_phone(api, sms)
        await add_to_cart(shopper.client, in_stock(api).product_id, quantity=1, token=shopper.token)
        address_id = await add_address(shopper)
        headers = {**shopper.auth, "Idempotency-Key": uuid.uuid4().hex}
        body = {"address_id": address_id, "shipping_method": "standard"}

        without = await shopper.client.post(CHECKOUT, json=body, headers=headers)
        placed = await shopper.client.post(
            CHECKOUT, json={**body, "contact_email": "Ada@Example.com"}, headers=headers
        )

        assert without.status_code == 422
        assert without.json()["type"] == "urn:angel:problem:contact-email-required"
        assert placed.status_code == 200, placed.text
        (order,) = await orders_in_db(api, user_id=shopper.user_id)
        assert order["contact_email"] == "ada@example.com"
