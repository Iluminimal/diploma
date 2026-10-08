import asyncio

import pytest
from httpx import Response
from sqlalchemy import text

from tests.commerce import (
    Shopper,
    add_address,
    add_to_cart,
    checkout,
    register,
    send_webhook,
    set_product,
    stock_of,
    webhook,
)
from tests.conftest import Api, ApiFactory
from tests.fakes import RecordingGateway, RecordingMailer

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

HOOK = "/api/v1/webhooks/stripe"


class Placed:
    """A pending order with its payment, ready to receive webhooks."""

    def __init__(
        self, api: Api, shopper: Shopper, number: str, total: int, product_id: int, intent_id: str
    ) -> None:
        self.api = api
        self.shopper = shopper
        self.number = number
        self.total = total
        self.product_id = product_id
        self.intent_id = intent_id

    async def event(
        self,
        kind: str,
        *,
        amount: int | None = None,
        currency: str = "usd",
        event_id: str | None = None,
        message: str | None = None,
    ) -> Response:
        return await send_webhook(
            self.api.client,
            kind,
            self.intent_id,
            amount=self.total if amount is None else amount,
            currency=currency,
            event_id=event_id,
            message=message,
        )

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
    return RecordingGateway("whsec_test_secret")


async def place_order(api: Api, *, quantity: int = 2) -> Placed:
    product = next(e for e in api.entries if e.in_stock and e.article_type != "Casual Shoes")
    shopper = await register(api.client)
    await add_to_cart(
        api.client, product.product_id, size="M", quantity=quantity, token=shopper.token
    )
    address_id = await add_address(shopper)
    response = await checkout(shopper, address_id)
    assert response.status_code == 200, response.text
    order = response.json()["order"]
    async with api.app.state.engine.connect() as connection:
        intent_id = (
            await connection.execute(text("SELECT provider_payment_id FROM payments"))
        ).scalar_one()
    return Placed(
        api, shopper, order["number"], order["total_cents"], product.product_id, intent_id
    )


# --- authenticity ----------------------------------------------------------------------------


async def test_unsigned_or_wrongly_signed_webhooks_are_rejected_and_change_nothing(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        body, headers = webhook("succeeded", placed.intent_id, amount=placed.total)
        forged, forged_headers = webhook(
            "succeeded", placed.intent_id, amount=placed.total, secret="whsec_attacker"
        )

        no_header = await api.client.post(HOOK, content=body)
        wrong_secret = await api.client.post(HOOK, content=forged, headers=forged_headers)
        tampered = await api.client.post(HOOK, content=body.replace(b"1", b"9"), headers=headers)
        junk = await api.client.post(
            HOOK, content=b"not json", headers={"Stripe-Signature": "t=1,v1=abc"}
        )

        assert [r.status_code for r in (no_header, wrong_secret, tampered, junk)] == [400] * 4
        assert no_header.json()["type"] == "urn:lookalike:problem:invalid-signature"
        assert (await placed.order())["status"] == "pending"


async def test_a_stale_signature_is_rejected(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        body, headers = webhook("succeeded", placed.intent_id, amount=placed.total)
        timestamp, _, signature = headers["Stripe-Signature"].partition(",")
        old = f"t={int(timestamp[2:]) - 3600},{signature}"  # replayed an hour later

        response = await api.client.post(
            HOOK, content=body, headers={**headers, "Stripe-Signature": old}
        )

        assert response.status_code == 400


async def test_webhook_needs_no_session_and_no_origin(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        body, headers = webhook("succeeded", placed.intent_id, amount=placed.total)

        # Stripe is not a browser: no cookies, no Origin, and a foreign one must not matter.
        response = await api.client.post(
            HOOK, content=body, headers={**headers, "Origin": "https://stripe.com"}
        )

        assert response.status_code == 200
        assert response.json() == {"received": True}


async def test_oversized_bodies_are_refused(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        response = await api.client.post(
            HOOK, content=b"x" * (300 * 1024), headers={"Stripe-Signature": "t=1,v1=a"}
        )

        assert response.status_code == 413


async def test_webhooks_are_unavailable_when_payments_are_not_configured(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(payments_mode="stripe", stripe_secret_key="") as api:
        response = await api.client.post(
            HOOK, content=b"{}", headers={"Stripe-Signature": "t=1,v1=a"}
        )

        assert response.status_code == 503


# --- success ---------------------------------------------------------------------------------


async def test_a_successful_payment_marks_the_order_paid_once(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        placed = await place_order(api)

        response = await placed.event("succeeded")

        assert response.status_code == 200
        order = await placed.order()
        assert order["status"] == "paid"
        assert order["paid_at"]
        payment = await placed.payment()
        assert payment["status"] == "succeeded"
        assert payment["client_secret"] is None  # no longer needed
        assert await placed.stock() == 5  # stays reserved: it was sold
        cart = await api.client.get("/api/v1/cart", headers=placed.shopper.auth)
        assert cart.json()["lines"] == []
        confirmations = [m for m in mailer.sent if "confirmed" in m.subject]
        assert len(confirmations) == 1
        assert placed.number in confirmations[0].subject


async def test_the_same_event_delivered_twice_is_applied_once(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        placed = await place_order(api)
        body, headers = webhook(
            "succeeded", placed.intent_id, amount=placed.total, event_id="evt_same"
        )

        responses = [await api.client.post(HOOK, content=body, headers=headers) for _ in range(3)]

        assert [r.status_code for r in responses] == [200, 200, 200]
        assert len([m for m in mailer.sent if "confirmed" in m.subject]) == 1
        async with api.app.state.engine.connect() as connection:
            recorded = (
                await connection.execute(
                    text("SELECT count(*) FROM stripe_events WHERE id = 'evt_same'")
                )
            ).scalar_one()
        assert recorded == 1


async def test_a_second_success_event_for_a_paid_order_changes_nothing(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        placed = await place_order(api)

        await placed.event("succeeded")
        await placed.event("succeeded")  # different event id, same payment

        assert len([m for m in mailer.sent if "confirmed" in m.subject]) == 1
        assert gateway.refunds == []


async def test_a_payment_of_the_wrong_amount_is_refunded_not_fulfilled(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)

        wrong_amount = await placed.event("succeeded", amount=placed.total - 1)

        assert wrong_amount.status_code == 200
        order = await placed.order()
        assert order["status"] == "cancelled"
        assert gateway.refunds == [placed.intent_id]
        assert (await placed.payment())["status"] == "refunded"
        assert await placed.stock() == 7  # given back


async def test_a_payment_in_the_wrong_currency_is_refunded_too(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)

        await placed.event("succeeded", currency="eur")

        assert (await placed.order())["status"] == "cancelled"
        assert gateway.refunds == [placed.intent_id]


# --- late and out-of-order events ------------------------------------------------------------


async def test_payment_after_the_order_was_cancelled_is_refunded(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        # The shopper starts a new checkout; the first order is replaced and its stock released.
        second = await checkout(placed.shopper, await add_address(placed.shopper))
        assert second.status_code == 200
        assert (await placed.order())["status"] == "cancelled"

        late = await placed.event("succeeded")

        assert late.status_code == 200
        assert (await placed.order())["status"] == "cancelled"  # never resurrected
        assert gateway.refunds == [placed.intent_id]
        assert (await placed.payment())["status"] == "refunded"
        assert await placed.stock() == 5  # only the second order holds stock


async def test_a_failed_refund_is_retried_when_the_event_is_redelivered(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        await checkout(placed.shopper, await add_address(placed.shopper))
        gateway.fail_refund = True
        body, headers = webhook(
            "succeeded", placed.intent_id, amount=placed.total, event_id="evt_late"
        )

        first = await api.client.post(HOOK, content=body, headers=headers)
        gateway.fail_refund = False
        redelivered = await api.client.post(HOOK, content=body, headers=headers)

        assert first.status_code == 503  # Stripe will try again
        assert redelivered.status_code == 200
        assert gateway.refunds == [placed.intent_id]  # refunded exactly once, on the retry
        assert (await placed.payment())["status"] == "refunded"


async def test_a_declined_card_keeps_the_order_open_for_another_try(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)

        failed = await placed.event("failed", message="Your card was declined.")

        assert failed.status_code == 200
        payment = await placed.payment()
        assert payment["status"] == "failed"
        assert payment["last_error"] == "Your card was declined."
        assert (await placed.order())["status"] == "pending"
        assert await placed.stock() == 5  # still reserved
        await placed.event("succeeded")  # the retry with another card works
        assert (await placed.order())["status"] == "paid"
        assert (await placed.payment())["status"] == "succeeded"


async def test_a_late_failure_does_not_undo_a_payment(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        await placed.event("succeeded")

        await placed.event("failed", message="late")
        await placed.event("canceled")

        assert (await placed.order())["status"] == "paid"
        assert (await placed.payment())["status"] == "succeeded"
        assert await placed.stock() == 5


async def test_a_cancelled_payment_releases_the_stock(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)

        response = await placed.event("canceled")

        assert response.status_code == 200
        assert (await placed.order())["status"] == "cancelled"
        assert (await placed.payment())["status"] == "canceled"
        assert await placed.stock() == 7
        await placed.event("canceled", event_id="evt_again")  # and releasing twice is harmless
        assert await placed.stock() == 7


async def test_events_for_unknown_payments_and_other_event_types_are_acknowledged(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        body, headers = webhook(
            "succeeded",
            placed.intent_id,
            amount=placed.total,
            event_type="charge.dispute.created",
        )

        unknown = await send_webhook(api.client, "succeeded", "pi_not_ours", amount=100)
        ignored = await api.client.post(HOOK, content=body, headers=headers)

        assert unknown.status_code == 200
        assert ignored.status_code == 200
        assert (await placed.order())["status"] == "pending"


async def test_concurrent_deliveries_of_one_event_settle_once(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        placed = await place_order(api)
        body, headers = webhook(
            "succeeded", placed.intent_id, amount=placed.total, event_id="evt_x"
        )

        responses = await asyncio.gather(
            *(api.client.post(HOOK, content=body, headers=headers) for _ in range(5))
        )

        assert {r.status_code for r in responses} == {200}
        assert len([m for m in mailer.sent if "confirmed" in m.subject]) == 1
        assert (await placed.order())["status"] == "paid"


async def test_a_withdrawn_product_does_not_stop_the_payment_from_settling(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        placed = await place_order(api)
        await set_product(api.app.state.engine, placed.product_id, is_active=False)

        await placed.event("succeeded")

        assert (await placed.order())["status"] == "paid"
