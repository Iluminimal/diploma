"""QPay-ээр checkout: дэлгүүр төгрөгөөр үнэлдэг тул нэхэмжлэхийн дүн захиалгын дүнтэй яг
ижил, QR ба банкны холбоос, "Төлбөрөө шалгах"."""

import pytest

from tests.conftest import Api, ApiFactory
from tests.support.catalogue import Entry
from tests.support.commerce import Shopper, add_address, add_to_cart, another_client, checkout
from tests.support.commerce import register as register_shopper
from tests.support.fakes import RecordingGateway

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

CHECKOUT = "/api/v1/checkout"


@pytest.fixture
def gateway() -> RecordingGateway:
    return RecordingGateway(qpay=True)


def in_stock(api: Api) -> Entry:
    return next(e for e in api.entries if e.in_stock and e.article_type != "Casual Shoes")


async def shopper_with_cart(api: Api) -> tuple[Shopper, int]:
    shopper = await register_shopper(api.client)
    await add_to_cart(
        api.client, in_stock(api).product_id, size="M", quantity=1, token=shopper.token
    )
    return shopper, await add_address(shopper)


async def test_qpay_checkout_charges_the_order_total_in_tugrik_and_returns_the_qr(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api)

        response = await checkout(shopper, address_id)

        assert response.status_code == 200, response.text
        body = response.json()
        total = body["order"]["total_cents"]
        assert body["order"]["currency"] == "MNT"
        assert body["payment"]["provider"] == "qpay"
        assert body["payment"]["charge"] == {"currency": "MNT", "amount_minor": total}
        assert gateway.created[0]["currency"] == "MNT"
        assert (
            gateway.created[0]["amount"] == total
        )  # хөрвүүлэлтгүй: харуулсан дүн яг нэхэмжлэгдэнэ
        qpay = body["payment"]["qpay"]
        assert qpay["qr_image"]
        assert qpay["banks"][0]["link"] == "khanbank://q"
        assert body["order"]["charge"] == body["payment"]["charge"]


async def test_replaying_the_checkout_returns_the_same_invoice_and_paying_it_settles_the_order(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api)
        first = await checkout(shopper, address_id, key="replay-1")
        charge = first.json()["payment"]["charge"]

        replay = await checkout(shopper, address_id, key="replay-1")
        number = first.json()["order"]["number"]

        assert replay.json()["payment"]["charge"] == charge  # ижил нэхэмжлэх, ижил дүн
        assert len(gateway.created) == 1
        gateway.pay(gateway.intents[0], charge["amount_minor"], "MNT")
        paid = await shopper.client.post(
            f"{CHECKOUT}/orders/{number}/check-payment", headers=shopper.auth
        )
        assert paid.json()["status"] == "paid"


# --- "Төлбөрөө шалгах" -------------------------------------------------------------------------


async def test_checking_an_unpaid_order_changes_nothing(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api)
        number = (await checkout(shopper, address_id)).json()["order"]["number"]

        response = await shopper.client.post(
            f"{CHECKOUT}/orders/{number}/check-payment", headers=shopper.auth
        )

        assert response.status_code == 200
        assert response.json()["status"] == "pending"
        assert len(gateway.checks) == 1


async def test_checking_a_paid_order_settles_it_once(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api)
        body = (await checkout(shopper, address_id)).json()
        number = body["order"]["number"]
        gateway.pay(gateway.intents[0], body["payment"]["charge"]["amount_minor"])

        first = await shopper.client.post(
            f"{CHECKOUT}/orders/{number}/check-payment", headers=shopper.auth
        )
        second = await shopper.client.post(
            f"{CHECKOUT}/orders/{number}/check-payment", headers=shopper.auth
        )

        assert first.json()["status"] == "paid"
        assert second.json()["status"] == "paid"
        assert len(gateway.checks) == 1  # төлөгдсөн захиалгыг дахин асуухгүй


async def test_you_cannot_check_someone_elses_order(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api)
        number = (await checkout(shopper, address_id)).json()["order"]["number"]
        async with another_client(api) as browser:
            stranger = await register_shopper(browser)
            response = await browser.post(
                f"{CHECKOUT}/orders/{number}/check-payment", headers=stranger.auth
            )

        assert response.status_code == 404
        assert gateway.checks == []


async def test_a_provider_outage_during_the_check_is_reported(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        shopper, address_id = await shopper_with_cart(api)
        number = (await checkout(shopper, address_id)).json()["order"]["number"]
        gateway.fail_check = True

        response = await shopper.client.post(
            f"{CHECKOUT}/orders/{number}/check-payment", headers=shopper.auth
        )

        assert response.status_code == 502
        assert response.json()["type"] == "urn:angel:problem:payment-provider-error"


async def test_checkout_tells_the_page_how_it_will_take_payment(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        qpay = await api.client.get(f"{CHECKOUT}/payment-method")
    async with api_factory() as api:
        offline = await api.client.get(f"{CHECKOUT}/payment-method")
    async with api_factory(payments_mode="qpay", qpay_client_id="") as api:
        missing = await api.client.get(f"{CHECKOUT}/payment-method")

    assert qpay.json() == {"provider": "qpay", "charge_currency": "MNT"}
    assert offline.json() == {"provider": "offline", "charge_currency": "MNT"}
    assert missing.json() == {"provider": None, "charge_currency": "MNT"}
