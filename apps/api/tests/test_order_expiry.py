import asyncio

import pytest
from sqlalchemy import text

from angel.services.commerce.expiry import OrderExpirer
from tests.commerce import (
    Shopper,
    add_address,
    add_to_cart,
    another_client,
    checkout,
    register,
    stock_of,
)
from tests.conftest import Api, ApiFactory
from tests.fakes import RecordingGateway

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]


@pytest.fixture
def gateway() -> RecordingGateway:
    return RecordingGateway("whsec_test_secret")


def expirer(api: Api, gateway: RecordingGateway | None) -> OrderExpirer:
    return OrderExpirer(api.app.state.sessions, gateway, api.settings)


async def pending_order(api: Api, quantity: int = 3) -> tuple[str, int, Shopper]:
    product = next(e for e in api.entries if e.in_stock and e.article_type != "Casual Shoes")
    shopper = await register(api.client)
    await add_to_cart(
        api.client, product.product_id, size="M", quantity=quantity, token=shopper.token
    )
    response = await checkout(shopper, await add_address(shopper))
    assert response.status_code == 200
    return response.json()["order"]["number"], product.product_id, shopper


async def age_orders(api: Api, minutes: int) -> None:
    async with api.app.state.engine.begin() as connection:
        await connection.execute(
            text("UPDATE orders SET created_at = now() - make_interval(mins => :m)"),
            {"m": minutes},
        )


async def status_of(api: Api, number: str) -> tuple[str, str | None]:
    async with api.app.state.engine.connect() as connection:
        row = (
            await connection.execute(
                text("SELECT status, cancel_reason FROM orders WHERE number = :n"), {"n": number}
            )
        ).one()
    return row.status, row.cancel_reason


async def test_unpaid_orders_past_the_deadline_give_their_stock_back(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        number, product_id, _ = await pending_order(api, quantity=3)
        await age_orders(api, api.settings.order_pending_ttl_minutes + 1)

        released = await expirer(api, gateway).run_once()

        assert released == 1
        assert await status_of(api, number) == ("cancelled", "expired")
        assert await stock_of(api.app.state.engine, product_id) == 7
        assert len(gateway.cancelled) == 1  # the payment can no longer be completed
        async with api.app.state.engine.connect() as connection:
            payment = (
                await connection.execute(text("SELECT status, client_secret FROM payments"))
            ).one()
        assert (payment.status, payment.client_secret) == ("canceled", None)


async def test_orders_inside_the_deadline_and_paid_orders_are_left_alone(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        fresh, product_id, shopper = await pending_order(api, quantity=1)
        await age_orders(api, api.settings.order_pending_ttl_minutes - 5)

        assert await expirer(api, gateway).run_once() == 0

        assert await status_of(api, fresh) == ("pending", None)
        await api.client.post(
            f"/api/v1/checkout/orders/{fresh}/simulate-payment",
            headers=shopper.auth,
        )
        await age_orders(api, 24 * 60)
        assert await expirer(api, gateway).run_once() == 0
        assert await status_of(api, fresh) == ("paid", None)
        assert await stock_of(api.app.state.engine, product_id) == 6


async def test_an_order_paid_in_the_meantime_is_not_expired(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        number, product_id, _ = await pending_order(api)
        await age_orders(api, 120)
        gateway.cancel_outcome = "succeeded"

        released = await expirer(api, gateway).run_once()

        assert released == 0
        assert await status_of(api, number) == ("pending", None)  # the webhook will settle it
        assert await stock_of(api.app.state.engine, product_id) == 4


async def test_a_provider_outage_defers_expiry_to_the_next_sweep(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        number, product_id, _ = await pending_order(api)
        await age_orders(api, 120)
        gateway.fail_cancel = True

        assert await expirer(api, gateway).run_once() == 0
        assert await status_of(api, number) == ("pending", None)  # never freed while still payable

        gateway.fail_cancel = False
        assert await expirer(api, gateway).run_once() == 1
        assert await status_of(api, number) == ("cancelled", "expired")
        assert await stock_of(api.app.state.engine, product_id) == 7


async def test_sweeps_are_idempotent_and_safe_to_run_at_the_same_time(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        number, product_id, _ = await pending_order(api, quantity=3)
        await age_orders(api, 120)

        results = await asyncio.gather(*(expirer(api, gateway).run_once() for _ in range(4)))
        again = await expirer(api, gateway).run_once()

        assert sum(results) == 1  # exactly one sweeper released it
        assert again == 0
        assert await status_of(api, number) == ("cancelled", "expired")
        assert await stock_of(api.app.state.engine, product_id) == 7  # not 7 + 3 * 4


async def test_stale_guest_carts_are_deleted_but_accounts_and_fresh_guests_are_kept(
    api_factory: ApiFactory, gateway: RecordingGateway
) -> None:
    async with api_factory(gateway=gateway) as api:
        product = api.entries[0].product_id
        async with another_client(api) as stale_guest, another_client(api) as fresh_guest:
            await add_to_cart(stale_guest, product)
            await add_to_cart(fresh_guest, product)
        member = await register(api.client)
        await add_to_cart(api.client, product, token=member.token)
        async with api.app.state.engine.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE carts SET updated_at = now() - interval '90 days' "
                    "WHERE id = (SELECT min(id) FROM carts)"
                )
            )
            await connection.execute(  # the account cart is old too, which must not matter
                text(
                    "UPDATE carts SET updated_at = now() - interval '90 days' "
                    "WHERE user_id IS NOT NULL"
                )
            )

        await expirer(api, gateway).run_once()

        async with api.app.state.engine.connect() as connection:
            rows = (
                await connection.execute(text("SELECT user_id IS NULL AS guest FROM carts"))
            ).all()
        assert sorted(r.guest for r in rows) == [False, True]  # the account's and the fresh guest's
