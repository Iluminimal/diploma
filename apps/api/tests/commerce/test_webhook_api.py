"""QPay-ийн мэдэгдэл (callback) ба төлбөр шийдвэрлэх. Мэдэгдэл гарын үсэггүй тул зөвхөн шалгах
дохио: захиалга зөвхөн provider-ийн `check` баталгаажуулсан төлбөрөөр өөрчлөгдөнө."""

import asyncio

import pytest
from httpx import Response
from sqlalchemy import text

from tests.conftest import Api, ApiFactory
from tests.support.commerce import (
    Shopper,
    add_address,
    add_to_cart,
    checkout,
    qpay_callback,
    register,
    set_product,
    stock_of,
)
from tests.support.fakes import RecordingGateway, RecordingMailer

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

HOOK = "/api/v1/webhooks/qpay"


class Placed:
    """Төлбөр хүлээж буй захиалга (QPay нэхэмжлэхтэй), мэдэгдэл хүлээн авахад бэлэн."""

    def __init__(
        self,
        api: Api,
        gateway: RecordingGateway,
        shopper: Shopper,
        number: str,
        charge: int,
        product_id: int,
        intent_id: str,
    ) -> None:
        self.api = api
        self.gateway = gateway
        self.shopper = shopper
        self.number = number
        self.charge = charge
        self.product_id = product_id
        self.intent_id = intent_id

    async def pay_and_notify(
        self, *, amount: int | None = None, currency: str = "MNT", payment_id: str | None = None
    ) -> Response:
        """Худалдан авагч банкны апп-аараа төлж, QPay мэдэгдэл илгээнэ."""
        self.gateway.pay(
            self.intent_id,
            self.charge if amount is None else amount,
            currency,
            payment_id=payment_id,
        )
        return await qpay_callback(self.api.client, self.number)

    async def order(self) -> dict[str, object]:
        response = await self.api.client.get(
            f"/api/v1/orders/{self.number}", headers=self.shopper.auth
        )
        body: dict[str, object] = response.json()
        return body

    async def payment(self) -> dict[str, object]:
        async with self.api.app.state.engine.connect() as connection:
            row = (
                await connection.execute(
                    text("SELECT * FROM payments WHERE provider_payment_id = :id"),
                    {"id": self.intent_id},
                )
            ).one()
        return dict(row._mapping)

    async def stock(self) -> int:
        return await stock_of(self.api.app.state.engine, self.product_id)


@pytest.fixture
def gateway() -> RecordingGateway:
    return RecordingGateway(qpay=True)


async def place_order(api: Api, gateway: RecordingGateway, *, quantity: int = 2) -> Placed:
    product = next(e for e in api.entries if e.in_stock and e.article_type != "Casual Shoes")
    shopper = await register(api.client)
    await add_to_cart(
        api.client, product.product_id, size="M", quantity=quantity, token=shopper.token
    )
    address_id = await add_address(shopper)
    response = await checkout(shopper, address_id)
    assert response.status_code == 200, response.text
    body = response.json()
    async with api.app.state.engine.connect() as connection:
        intent_id = (
            await connection.execute(text("SELECT provider_payment_id FROM payments"))
        ).scalar_one()
    return Placed(
        api,
        gateway,
        shopper,
        body["order"]["number"],
        body["payment"]["charge"]["amount_minor"],
        product.product_id,
        intent_id,
    )


# --- Мэдэгдэл -------------------------------------------------------------------------------


async def test_a_notification_needs_no_session_or_origin_and_accepts_get_and_post(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)

        get = await api.client.get(HOOK, params={"order": placed.number})
        post = await api.client.post(
            HOOK, params={"order": placed.number}, headers={"Origin": "https://qpay.mn"}
        )

        assert [get.status_code, post.status_code] == [200, 200]
        assert get.json() == {"received": True}
        assert gateway.checks == [placed.intent_id, placed.intent_id]
        assert (await placed.order())["status"] == "pending"  # төлөөгүй: юу ч өөрчлөгдөхгүй


async def test_a_notification_alone_cannot_mark_an_order_paid(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)

        # Хэн ч энэ хаягийг дуудаж чадна: provider төлбөрийг баталгаажуулаагүй бол нөлөөгүй.
        responses = [await qpay_callback(api.client, placed.number) for _ in range(3)]

        assert {r.status_code for r in responses} == {200}
        assert (await placed.order())["status"] == "pending"
        assert (await placed.payment())["status"] == "requires_payment"


async def test_notifications_for_unknown_orders_are_acknowledged(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        response = await qpay_callback(api.client, "LK-NOTOURS1")

        assert response.status_code == 200
        assert gateway.checks == []


async def test_a_malformed_order_number_is_rejected(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        response = await api.client.get(HOOK, params={"order": "<script>"})

        assert response.status_code == 422


async def test_notifications_are_unavailable_when_payments_are_not_configured(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(payments_mode="qpay", qpay_client_id="") as api:
        response = await qpay_callback(api.client, "LK-ABCDEFGH")

        assert response.status_code == 503


async def test_a_failing_check_changes_nothing_and_asks_for_a_retry(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)
        gateway.fail_check = True

        response = await placed.pay_and_notify()

        assert response.status_code == 503
        assert (await placed.order())["status"] == "pending"
        gateway.fail_check = False
        assert (await qpay_callback(api.client, placed.number)).status_code == 200
        assert (await placed.order())["status"] == "paid"


# --- Амжилттай -------------------------------------------------------------------------------


async def test_a_confirmed_payment_marks_the_order_paid_once(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        placed = await place_order(api, gateway)

        response = await placed.pay_and_notify()

        assert response.status_code == 200
        order = await placed.order()
        assert order["status"] == "paid"
        assert order["paid_at"]
        payment = await placed.payment()
        assert payment["status"] == "succeeded"
        assert payment["provider_data"] is None  # QR дахин хэрэггүй
        assert await placed.stock() == 5  # зарагдсан тул нөөц хэвээр
        cart = await api.client.get("/api/v1/cart", headers=placed.shopper.auth)
        assert cart.json()["lines"] == []
        confirmations = [m for m in mailer.sent if "баталгаажлаа" in m.subject]
        assert len(confirmations) == 1
        assert placed.number in confirmations[0].subject
        assert f"{placed.charge // 100:,} MNT" in confirmations[0].body


async def test_the_same_payment_reported_repeatedly_is_applied_once(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        placed = await place_order(api, gateway)
        gateway.pay(placed.intent_id, placed.charge, payment_id="same")

        responses = [await qpay_callback(api.client, placed.number) for _ in range(3)]

        assert [r.status_code for r in responses] == [200, 200, 200]
        assert len([m for m in mailer.sent if "баталгаажлаа" in m.subject]) == 1
        async with api.app.state.engine.connect() as connection:
            recorded = (
                await connection.execute(
                    text("SELECT count(*) FROM payment_events WHERE id = 'qpay_same'")
                )
            ).scalar_one()
        assert recorded == 1
        assert gateway.refunds == []


async def test_concurrent_notifications_settle_once(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        placed = await place_order(api, gateway)
        gateway.pay(placed.intent_id, placed.charge, payment_id="race")

        responses = await asyncio.gather(
            *(qpay_callback(api.client, placed.number) for _ in range(5))
        )

        assert {r.status_code for r in responses} == {200}
        assert len([m for m in mailer.sent if "баталгаажлаа" in m.subject]) == 1
        assert (await placed.order())["status"] == "paid"


async def test_a_payment_of_the_wrong_amount_is_refunded_not_fulfilled(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)

        wrong_amount = await placed.pay_and_notify(amount=placed.charge - 100)

        assert wrong_amount.status_code == 200
        assert (await placed.order())["status"] == "cancelled"
        assert gateway.refunds == [placed.intent_id]
        assert (await placed.payment())["status"] == "refunded"
        assert await placed.stock() == 7  # буцаан олгосон


async def test_a_payment_in_the_wrong_currency_is_refunded_too(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)

        await placed.pay_and_notify(currency="USD")

        assert (await placed.order())["status"] == "cancelled"
        assert gateway.refunds == [placed.intent_id]


# --- Хожимдсон төлбөр ------------------------------------------------------------------------


async def test_payment_after_the_order_was_cancelled_is_refunded(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)
        # Худалдан авагч шинэ checkout эхлүүлнэ; эхний захиалга солигдож, нөөц нь суллагдана.
        second = await checkout(placed.shopper, await add_address(placed.shopper))
        assert second.status_code == 200
        assert (await placed.order())["status"] == "cancelled"

        late = await placed.pay_and_notify()  # хуучин QR-аар төлчихсөн

        assert late.status_code == 200
        assert (await placed.order())["status"] == "cancelled"  # хэзээ ч сэргээгдэхгүй
        assert gateway.refunds == [placed.intent_id]
        assert (await placed.payment())["status"] == "refunded"
        assert await placed.stock() == 5  # зөвхөн хоёр дахь захиалга нөөц эзэлнэ


async def test_a_failed_refund_is_retried_on_the_next_notification(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)
        await checkout(placed.shopper, await add_address(placed.shopper))
        gateway.fail_refund = True
        gateway.pay(placed.intent_id, placed.charge, payment_id="late")

        first = await qpay_callback(api.client, placed.number)
        gateway.fail_refund = False
        again = await qpay_callback(api.client, placed.number)

        assert first.status_code == 503  # юу ч бүртгэгдээгүй
        assert again.status_code == 200
        assert gateway.refunds == [placed.intent_id]  # retry үед яг нэг удаа буцаан олгосон
        assert (await placed.payment())["status"] == "refunded"


async def test_a_withdrawn_product_does_not_stop_the_payment_from_settling(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api, gateway)
        await set_product(api.app.state.engine, placed.product_id, is_active=False)

        await placed.pay_and_notify()

        assert (await placed.order())["status"] == "paid"
