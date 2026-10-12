"""Shipping, delivering, cancelling, refunding and annotating orders, as an administrator."""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from httpx import Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.commerce import Shopper, send_webhook, stock_of
from tests.conftest import WEBHOOK_SECRET, Api, ApiFactory
from tests.fakes import RecordingGateway, RecordingMailer
from tests.test_admin_orders_api import administrator, in_stock, place_order

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ADMIN = "/api/v1/admin/orders"
INVALID = "urn:lookalike:problem:invalid-order-transition"
SHIP = {"carrier": "DHL", "tracking_number": "JD0146 0000 1234"}


class Shop:
    """A running app with a recording gateway and mailer, an administrator and orders to act on."""

    def __init__(
        self, api: Api, admin: Shopper, gateway: RecordingGateway, mailer: RecordingMailer
    ):
        self.api, self.admin, self.gateway, self.mailer = api, admin, gateway, mailer

    async def order(self, *, pay: bool = True, skip: int = 0) -> tuple[Shopper, str, int]:
        product = in_stock(self.api, skip)
        customer, number = await place_order(self.api, product, pay=pay)
        return customer, number, product.product_id

    async def act(self, number: str, action: str, **body: object) -> Response:
        return await self.api.client.post(
            f"{ADMIN}/{number}/{action}", json=body or None, headers=self.admin.auth
        )

    async def get(self, number: str) -> dict[str, Any]:
        response = await self.api.client.get(f"{ADMIN}/{number}", headers=self.admin.auth)
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body


@pytest.fixture
async def shop(
    api_factory: ApiFactory, db_engine: AsyncEngine, tmp_path: Path
) -> AsyncIterator[Shop]:
    gateway = RecordingGateway(WEBHOOK_SECRET)
    async with api_factory(media_dir=tmp_path, gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        yield Shop(api, await administrator(api, db_engine), gateway, mailer)


def event_types(order: dict[str, Any]) -> list[str]:
    return [event["type"] for event in order["events"]]


# --- shipping and delivering ------------------------------------------------------------------


async def test_a_paid_order_can_be_shipped_with_a_tracking_number(shop: Shop) -> None:
    customer, number, _ = await shop.order()

    response = await shop.act(number, "ship", **SHIP)

    body = response.json()
    assert response.status_code == 200, response.text
    assert body["status"] == "shipped"
    assert (body["carrier"], body["tracking_number"]) == ("DHL", "JD0146 0000 1234")
    assert body["shipped_at"] is not None
    assert event_types(body) == ["placed", "paid", "shipped"]
    assert body["events"][-1]["data"]["actor"] == shop.admin.email
    [email] = [m for m in shop.mailer.sent if "on its way" in m.subject]
    assert email.to == customer.email
    assert "JD0146 0000 1234" in email.body
    assert "DHL" in email.body


async def test_the_customer_sees_tracking_and_a_timeline_without_internal_detail(
    shop: Shop,
) -> None:
    customer, number, _ = await shop.order()
    await shop.act(number, "ship", **SHIP)
    await shop.act(number, "notes", text="Customer asked for a gift box")

    response = await shop.api.client.get(f"/api/v1/orders/{number}", headers=customer.auth)

    body = response.json()
    assert (body["status"], body["carrier"], body["tracking_number"]) == (
        "shipped",
        "DHL",
        "JD0146 0000 1234",
    )
    assert [e["type"] for e in body["events"]] == ["placed", "paid", "shipped"]
    assert body["events"][-1]["data"] == {"carrier": "DHL", "tracking_number": "JD0146 0000 1234"}
    assert "gift box" not in response.text
    assert shop.admin.email not in response.text


async def test_a_shipped_order_can_be_marked_delivered(shop: Shop) -> None:
    _, number, _ = await shop.order()
    await shop.act(number, "ship", **SHIP)

    response = await shop.act(number, "deliver")

    body = response.json()
    assert response.status_code == 200, response.text
    assert (body["status"], event_types(body)[-1]) == ("delivered", "delivered")
    assert body["delivered_at"] is not None
    assert any("was delivered" in m.subject for m in shop.mailer.sent)


@pytest.mark.parametrize(
    ("setup", "action", "body"),
    [
        ("pending", "ship", SHIP),
        ("paid", "deliver", {}),
        ("shipped", "ship", SHIP),
        ("delivered", "ship", SHIP),
        ("delivered", "deliver", {}),
        ("cancelled", "ship", SHIP),
        ("refunded", "deliver", {}),
    ],
)
async def test_actions_only_apply_to_orders_in_the_right_state(
    shop: Shop, setup: str, action: str, body: dict[str, str]
) -> None:
    _, number, _ = await shop.order(pay=setup not in ("pending", "cancelled"))
    if setup == "cancelled":
        await shop.act(number, "cancel")
    if setup in ("shipped", "delivered"):
        await shop.act(number, "ship", **SHIP)
    if setup == "delivered":
        await shop.act(number, "deliver")
    if setup == "refunded":
        await shop.act(number, "refund", reason="x", restock=True)

    response = await shop.act(number, action, **body)

    assert response.status_code == 409, response.text
    assert response.json()["type"] == INVALID
    assert (await shop.get(number))["status"] == setup


@pytest.mark.parametrize("body", [{}, {"carrier": "", "tracking_number": "x"}, {"carrier": "DHL"}])
async def test_shipping_needs_a_carrier_and_a_tracking_number(
    shop: Shop, body: dict[str, str]
) -> None:
    _, number, _ = await shop.order()

    response = await shop.act(number, "ship", **body)

    assert response.status_code == 422
    assert (await shop.get(number))["status"] == "paid"


async def test_two_administrators_shipping_at_once_ship_it_once(shop: Shop) -> None:
    _, number, _ = await shop.order()

    first, second = await asyncio.gather(
        shop.act(number, "ship", **SHIP),
        shop.act(number, "ship", carrier="UPS", tracking_number="1Z"),
    )

    assert sorted([first.status_code, second.status_code]) == [200, 409]
    assert event_types(await shop.get(number)).count("shipped") == 1


# --- cancelling ---------------------------------------------------------------------------------


async def test_cancelling_an_unpaid_order_gives_the_stock_back_and_cancels_the_payment(
    shop: Shop, db_engine: AsyncEngine
) -> None:
    _, number, product_id = await shop.order(pay=False)
    reserved = await stock_of(db_engine, product_id)

    response = await shop.act(number, "cancel", reason="Customer called")

    body = response.json()
    assert response.status_code == 200, response.text
    assert (body["status"], body["cancel_reason"]) == ("cancelled", "admin")
    assert await stock_of(db_engine, product_id) == reserved + 2
    assert body["payment"]["status"] == "canceled"
    assert len(shop.gateway.cancelled) == 1
    assert event_types(body) == ["placed", "cancelled", "note"]
    assert body["events"][1]["data"] == {"reason": "admin", "actor": shop.admin.email}
    assert "Customer called" in body["events"][2]["data"]["text"]
    assert any("was cancelled" in m.subject for m in shop.mailer.sent)


async def test_a_paid_order_cannot_be_cancelled_only_refunded(shop: Shop) -> None:
    _, number, _ = await shop.order()

    response = await shop.act(number, "cancel")

    assert response.status_code == 409
    assert shop.gateway.cancelled == []


async def test_if_the_customer_paid_a_moment_ago_the_cancel_is_refused(shop: Shop) -> None:
    _, number, _ = await shop.order(pay=False)
    shop.gateway.cancel_outcome = "succeeded"

    response = await shop.act(number, "cancel")

    assert response.status_code == 409
    assert (await shop.get(number))["status"] == "pending"


async def test_if_the_provider_is_down_the_cancel_changes_nothing(
    shop: Shop, db_engine: AsyncEngine
) -> None:
    _, number, product_id = await shop.order(pay=False)
    reserved = await stock_of(db_engine, product_id)
    shop.gateway.fail_cancel = True

    response = await shop.act(number, "cancel")

    assert response.status_code == 502
    assert (await shop.get(number))["status"] == "pending"
    assert await stock_of(db_engine, product_id) == reserved


async def test_a_payment_that_arrives_after_an_admin_cancel_is_refunded(shop: Shop) -> None:
    _, number, _ = await shop.order(pay=False)
    before = await shop.get(number)
    intent = before["payment"]["provider_payment_id"]
    await shop.act(number, "cancel")

    response = await send_webhook(
        shop.api.client, "succeeded", intent, amount=before["total_cents"]
    )

    body = await shop.get(number)
    assert response.status_code == 200, response.text
    assert body["status"] == "cancelled"
    assert body["payment"]["status"] == "refunded"
    refunded = [e for e in body["events"] if e["type"] == "refunded"]
    assert [e["data"] for e in refunded] == [{"reason": "order_cancelled", "automatic": True}]


# --- refunding ----------------------------------------------------------------------------------


@pytest.mark.parametrize("before", ["paid", "shipped", "delivered"])
async def test_a_refund_returns_the_money_and_closes_the_order(shop: Shop, before: str) -> None:
    customer, number, _ = await shop.order()
    if before in ("shipped", "delivered"):
        await shop.act(number, "ship", **SHIP)
    if before == "delivered":
        await shop.act(number, "deliver")

    response = await shop.act(number, "refund", reason="Damaged in transit", restock=False)

    body = response.json()
    assert response.status_code == 200, response.text
    assert body["status"] == "refunded"
    assert body["refunded_at"] is not None
    assert body["payment"]["status"] == "refunded"
    assert body["payment"]["refund_id"]
    assert len(shop.gateway.refunds) == 1
    event = body["events"][-1]
    assert event["type"] == "refunded"
    assert event["data"]["reason"] == "Damaged in transit"
    assert (
        event["data"]["amount_cents"]
        == body["total_cents"] - body["shipping_cents"] + body["shipping_cents"]
    )
    [email] = [m for m in shop.mailer.sent if "was refunded" in m.subject]
    assert email.to == customer.email


async def test_restocking_puts_the_items_back_and_not_restocking_does_not(
    shop: Shop, db_engine: AsyncEngine
) -> None:
    _, first, product_id = await shop.order(skip=0)
    _, second, other_product = await shop.order(skip=1)
    after_sales = (await stock_of(db_engine, product_id), await stock_of(db_engine, other_product))

    await shop.act(first, "refund", reason="Out of stock after all", restock=True)
    await shop.act(second, "refund", reason="Lost in the post", restock=False)

    assert await stock_of(db_engine, product_id) == after_sales[0] + 2
    assert await stock_of(db_engine, other_product) == after_sales[1]


async def test_refunds_need_a_paid_order_and_happen_once(shop: Shop) -> None:
    _, unpaid, _ = await shop.order(pay=False)
    _, paid, _ = await shop.order(skip=1)

    on_unpaid = await shop.act(unpaid, "refund", reason="x", restock=True)
    first = await shop.act(paid, "refund", reason="x", restock=True)
    again = await shop.act(paid, "refund", reason="x", restock=True)

    assert (on_unpaid.status_code, first.status_code, again.status_code) == (409, 200, 409)
    assert len(shop.gateway.refunds) == 1


async def test_if_the_provider_is_down_the_refund_changes_nothing_and_can_be_retried(
    shop: Shop, db_engine: AsyncEngine
) -> None:
    _, number, product_id = await shop.order()
    stock = await stock_of(db_engine, product_id)
    shop.gateway.fail_refund = True

    failed = await shop.act(number, "refund", reason="x", restock=True)

    assert failed.status_code == 502
    body = await shop.get(number)
    assert (body["status"], body["payment"]["status"]) == ("paid", "succeeded")
    assert await stock_of(db_engine, product_id) == stock
    shop.gateway.fail_refund = False
    assert (await shop.act(number, "refund", reason="x", restock=True)).status_code == 200


@pytest.mark.parametrize(
    "body", [{"restock": True}, {"reason": "x"}, {"reason": "", "restock": True}]
)
async def test_a_refund_needs_a_reason_and_an_explicit_restock_choice(
    shop: Shop, body: dict[str, object]
) -> None:
    _, number, _ = await shop.order()

    assert (await shop.act(number, "refund", **body)).status_code == 422


# --- notes, listing, access -----------------------------------------------------------------------


async def test_notes_are_for_administrators_only(shop: Shop) -> None:
    customer, number, _ = await shop.order(pay=False)

    response = await shop.act(number, "notes", text="  Call before delivery  ")

    body = response.json()
    assert response.status_code == 200
    assert body["events"][-1]["type"] == "note"
    assert body["events"][-1]["data"] == {"text": "Call before delivery", "actor": shop.admin.email}
    customer_view = await shop.api.client.get(f"/api/v1/orders/{number}", headers=customer.auth)
    assert "note" not in [e["type"] for e in customer_view.json()["events"]]
    assert (await shop.act(number, "notes", text="")).status_code == 422


async def test_the_list_counts_orders_per_status_for_the_tabs(shop: Shop) -> None:
    _, paid, _ = await shop.order(skip=0)
    _, to_ship, _ = await shop.order(skip=1)
    await shop.order(pay=False, skip=2)
    await shop.act(paid, "ship", **SHIP)

    everything = await shop.api.client.get(ADMIN, headers=shop.admin.auth)
    shipped_only = await shop.api.client.get(
        ADMIN, params={"status": "shipped"}, headers=shop.admin.auth
    )

    assert everything.json()["status_counts"] == {"shipped": 1, "paid": 1, "pending": 1}
    assert shipped_only.json()["total"] == 1
    assert shipped_only.json()["status_counts"] == everything.json()["status_counts"]
    assert shipped_only.json()["items"][0]["number"] == paid
    assert to_ship


@pytest.mark.parametrize("action", ["ship", "deliver", "cancel", "refund", "notes"])
async def test_only_administrators_can_act_on_orders(shop: Shop, action: str) -> None:
    customer, number, _ = await shop.order()

    anonymous = await shop.api.client.post(f"{ADMIN}/{number}/{action}", json={})
    as_customer = await shop.api.client.post(
        f"{ADMIN}/{number}/{action}", json={}, headers=customer.auth
    )

    assert (anonymous.status_code, as_customer.status_code) == (401, 403)
    assert (await shop.get(number))["status"] == "paid"


async def test_acting_on_an_unknown_order_is_a_404(shop: Shop) -> None:
    response = await shop.act("LK-NOSUCH99", "deliver")

    assert response.status_code == 404
    assert response.json()["type"] == "urn:lookalike:problem:order-not-found"


async def test_the_whole_history_is_recorded_from_checkout_on(
    shop: Shop, db_engine: AsyncEngine
) -> None:
    _, number, _ = await shop.order()
    await shop.act(number, "ship", **SHIP)
    await shop.act(number, "deliver")
    await shop.act(number, "refund", reason="Changed mind", restock=False)

    assert event_types(await shop.get(number)) == [
        "placed",
        "paid",
        "shipped",
        "delivered",
        "refunded",
    ]
    async with db_engine.connect() as connection:
        stamps = (
            (await connection.execute(text("SELECT created_at FROM order_events ORDER BY id")))
            .scalars()
            .all()
        )
    assert stamps == sorted(stamps)
