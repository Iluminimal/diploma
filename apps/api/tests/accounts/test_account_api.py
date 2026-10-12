import asyncio

import pytest

from tests.conftest import ApiFactory
from tests.support.commerce import ADDRESS, add_address, another_client, register, set_product

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

WISHLIST = "/api/v1/wishlist"
ADDRESSES = "/api/v1/addresses"


# --- wishlist --------------------------------------------------------------------------------


async def test_wishlist_requires_an_account(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product_id = api.entries[0].product_id

        responses = [
            await api.client.get(WISHLIST),
            await api.client.put(f"{WISHLIST}/{product_id}"),
            await api.client.delete(f"{WISHLIST}/{product_id}"),
        ]

        assert [r.status_code for r in responses] == [401, 401, 401]


async def test_wishlist_add_list_remove_is_idempotent_and_newest_first(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        first, second = api.entries[0].product_id, api.entries[1].product_id

        added = [
            await api.client.put(f"{WISHLIST}/{first}", headers=shopper.auth) for _ in range(2)
        ]
        await api.client.put(f"{WISHLIST}/{second}", headers=shopper.auth)
        listing = await api.client.get(WISHLIST, headers=shopper.auth)
        removed = [
            await api.client.delete(f"{WISHLIST}/{first}", headers=shopper.auth) for _ in range(2)
        ]
        after = await api.client.get(WISHLIST, headers=shopper.auth)

        assert [r.status_code for r in added] == [204, 204]
        assert [p["id"] for p in listing.json()["items"]] == [second, first]
        assert listing.json()["items"][0]["image"]["thumb_400"]
        assert [r.status_code for r in removed] == [204, 204]
        assert [p["id"] for p in after.json()["items"]] == [second]
        assert listing.headers["cache-control"] == "no-store"


async def test_concurrent_wishlist_taps_do_not_fail(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        product_id = api.entries[0].product_id

        responses = await asyncio.gather(
            *(api.client.put(f"{WISHLIST}/{product_id}", headers=shopper.auth) for _ in range(6))
        )

        assert {r.status_code for r in responses} == {204}
        listing = await api.client.get(WISHLIST, headers=shopper.auth)
        assert len(listing.json()["items"]) == 1


async def test_wishlist_rejects_unknown_products_and_hides_withdrawn_ones(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        product_id = api.entries[0].product_id

        unknown = await api.client.put(f"{WISHLIST}/999999", headers=shopper.auth)
        await api.client.put(f"{WISHLIST}/{product_id}", headers=shopper.auth)
        await set_product(api.app.state.engine, product_id, is_active=False)
        listing = await api.client.get(WISHLIST, headers=shopper.auth)

        assert unknown.status_code == 404
        assert listing.json()["items"] == []


async def test_each_user_has_their_own_wishlist(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        ann = await register(api.client)
        async with another_client(api) as browser:
            bob = await register(browser)
            await api.client.put(f"{WISHLIST}/{api.entries[0].product_id}", headers=ann.auth)

            assert (await browser.get(WISHLIST, headers=bob.auth)).json()["items"] == []


# --- addresses -------------------------------------------------------------------------------


async def test_address_book_basics(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)

        first = await api.client.post(ADDRESSES, json=ADDRESS, headers=shopper.auth)
        second = await api.client.post(
            ADDRESSES, json={**ADDRESS, "line1": "9 Other Road"}, headers=shopper.auth
        )
        listing = await api.client.get(ADDRESSES, headers=shopper.auth)

        assert first.status_code == second.status_code == 201
        assert first.json()["country"] == "GB"  # normalised
        assert first.json()["is_default"] is True  # the first address is the default
        assert second.json()["is_default"] is False
        assert [a["id"] for a in listing.json()["items"]] == [
            first.json()["id"],
            second.json()["id"],
        ]


async def test_there_is_always_exactly_one_default(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        first = await add_address(shopper)
        second = await add_address(shopper, line1="2 Second St", is_default=True)
        third = await add_address(shopper, line1="3 Third St")

        async def defaults() -> list[int]:
            items = (await api.client.get(ADDRESSES, headers=shopper.auth)).json()["items"]
            return [a["id"] for a in items if a["is_default"]]

        assert await defaults() == [second]
        await api.client.patch(
            f"{ADDRESSES}/{third}", json={"is_default": True}, headers=shopper.auth
        )
        assert await defaults() == [third]
        await api.client.delete(f"{ADDRESSES}/{third}", headers=shopper.auth)
        assert len(await defaults()) == 1  # another one was promoted
        await api.client.delete(f"{ADDRESSES}/{second}", headers=shopper.auth)
        assert await defaults() == [first]


async def test_address_update_clears_optional_fields_but_not_required_ones(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        address_id = await add_address(shopper, line2="Flat 4", phone="+44 20 7946 0958")

        cleared = await api.client.patch(
            f"{ADDRESSES}/{address_id}", json={"line2": None, "city": "Leeds"}, headers=shopper.auth
        )
        required = await api.client.patch(
            f"{ADDRESSES}/{address_id}", json={"line1": None}, headers=shopper.auth
        )

        assert cleared.json()["line2"] is None
        assert cleared.json()["city"] == "Leeds"
        assert cleared.json()["phone"] == "+44 20 7946 0958"  # untouched
        assert required.status_code == 422


async def test_address_input_is_validated(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        bad = [
            {**ADDRESS, "country": "GBR"},
            {**ADDRESS, "country": "1G"},
            {**ADDRESS, "line1": "  "},
            {**ADDRESS, "phone": "call me"},
            {**ADDRESS, "is_admin": True},
            {k: v for k, v in ADDRESS.items() if k != "city"},
        ]

        codes = [
            (await api.client.post(ADDRESSES, json=body, headers=shopper.auth)).status_code
            for body in bad
        ]

        assert codes == [422] * len(bad)


async def test_address_book_has_a_size_limit(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        for n in range(10):
            await add_address(shopper, line1=f"{n} Road")

        response = await api.client.post(ADDRESSES, json=ADDRESS, headers=shopper.auth)

        assert response.status_code == 409
        assert response.json()["type"] == "urn:angel:problem:address-limit"


async def test_nobody_can_read_change_or_delete_someone_elses_address(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        ann = await register(api.client)
        address_id = await add_address(ann)
        async with another_client(api) as browser:
            bob = await register(browser)

            patch = await browser.patch(
                f"{ADDRESSES}/{address_id}", json={"city": "Mallory"}, headers=bob.auth
            )
            delete = await browser.delete(f"{ADDRESSES}/{address_id}", headers=bob.auth)
            listing = await browser.get(ADDRESSES, headers=bob.auth)

        assert patch.status_code == delete.status_code == 404
        assert listing.json()["items"] == []
        mine = (await api.client.get(ADDRESSES, headers=ann.auth)).json()["items"]
        assert mine[0]["city"] == "London"
