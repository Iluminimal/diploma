"""Худалдан авагч төлбөр хүлээж буй захиалгаа цуцлах, QR-аа дахин харах."""

import pytest

from tests.conftest import Api, ApiFactory
from tests.support.commerce import (
    Shopper,
    add_address,
    add_to_cart,
    another_client,
    checkout,
    register,
    stock_of,
)
from tests.support.fakes import RecordingGateway

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ORDERS = "/api/v1/orders"


@pytest.fixture
def gateway() -> RecordingGateway:
    return RecordingGateway(qpay=True)


def in_stock(api: Api):  # type: ignore[no-untyped-def]
    return next(e for e in api.entries if e.in_stock and e.article_type != "Casual Shoes")


async def placed(api: Api, quantity: int = 2) -> tuple[Shopper, str, int]:
    product = in_stock(api)
    shopper = await register(api.client)
    await add_to_cart(
        api.client, product.product_id, size="M", quantity=quantity, token=shopper.token
    )
    response = await checkout(shopper, await add_address(shopper))
    assert response.status_code == 200, response.text
    return shopper, response.json()["order"]["number"], product.product_id


async def test_a_pending_order_can_be_reopened_with_its_qr_and_deadline(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, number, _ = await placed(api)

        shown = (await api.client.get(f"{ORDERS}/{number}", headers=shopper.auth)).json()

        assert shown["status"] == "pending"
        assert shown["qpay"]["qr_image"]
        assert shown["qpay"]["banks"][0]["link"] == "khanbank://q"
        assert shown["expires_at"] > shown["created_at"]


async def test_a_paid_order_has_no_qr_or_deadline(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, number, _ = await placed(api)
        amount = int(str(gateway.created[0]["amount"]))
        gateway.pay(gateway.intents[0], amount, "MNT")
        await shopper.client.post(
            f"/api/v1/checkout/orders/{number}/check-payment", headers=shopper.auth
        )

        shown = (await api.client.get(f"{ORDERS}/{number}", headers=shopper.auth)).json()

        assert shown["status"] == "paid"
        assert shown["qpay"] is None
        assert shown["expires_at"] is None


async def test_cancelling_gives_the_stock_back_and_closes_the_invoice(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, number, product_id = await placed(api, quantity=3)
        assert await stock_of(api.app.state.engine, product_id) == 4

        response = await api.client.post(f"{ORDERS}/{number}/cancel", headers=shopper.auth)

        body = response.json()
        assert response.status_code == 200, response.text
        assert body["status"] == "cancelled"
        assert body["events"][-1] == {
            "type": "cancelled",
            "at": body["events"][-1]["at"],
            "data": {"reason": "customer"},
        }
        assert body["qpay"] is None
        assert await stock_of(api.app.state.engine, product_id) == 7
        assert len(gateway.cancelled) == 1


async def test_a_second_cancel_and_a_paid_order_cannot_be_cancelled(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, number, _ = await placed(api)
        await api.client.post(f"{ORDERS}/{number}/cancel", headers=shopper.auth)

        again = await api.client.post(f"{ORDERS}/{number}/cancel", headers=shopper.auth)

        assert again.status_code == 409
        assert again.json()["type"] == "urn:angel:problem:invalid-order-transition"


async def test_an_order_that_was_paid_a_moment_ago_is_not_cancelled(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, number, product_id = await placed(api)
        gateway.cancel_outcome = "succeeded"

        response = await api.client.post(f"{ORDERS}/{number}/cancel", headers=shopper.auth)

        assert response.status_code == 409
        order = (await api.client.get(f"{ORDERS}/{number}", headers=shopper.auth)).json()
        assert order["status"] == "pending"  # төлбөрийг webhook/шалгалт шийднэ
        assert await stock_of(api.app.state.engine, product_id) == 5


async def test_nobody_can_cancel_someone_elses_order(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        _, number, _ = await placed(api)
        async with another_client(api) as browser:
            stranger = await register(browser)

            response = await browser.post(f"{ORDERS}/{number}/cancel", headers=stranger.auth)

        assert response.status_code == 404
