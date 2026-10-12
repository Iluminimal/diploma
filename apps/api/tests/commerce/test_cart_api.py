import asyncio

import pytest
from sqlalchemy import text

from tests.conftest import Api, ApiFactory
from tests.support.catalogue import Entry
from tests.support.commerce import (
    PASSWORD,
    add_to_cart,
    another_client,
    register,
    set_product,
    unique_email,
)

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

CART = "/api/v1/cart"


def pick(api: Api, *, in_stock: bool = True, footwear: bool = False, skip: int = 0) -> Entry:
    """A seeded product: apparel (sizes XS-XXL) or footwear (sizes 6-11), in or out of stock."""
    matches = [
        e
        for e in api.entries
        if e.in_stock == in_stock and (e.article_type == "Casual Shoes") == footwear
    ]
    return matches[skip]


async def test_empty_cart_for_a_new_visitor_and_no_cookie_is_handed_out(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        response = await api.client.get(CART)

        assert response.status_code == 200
        assert response.json() == {
            "lines": [],
            "item_count": 0,
            "subtotal_cents": 0,
            "currency": "USD",
            "has_issues": False,
        }
        assert "set-cookie" not in response.headers


async def test_guest_adds_a_product_and_gets_an_httponly_cart_cookie(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)

        response = await add_to_cart(api.client, product.product_id, size="M", quantity=2)

        body = response.json()
        assert response.status_code == 200
        [line] = body["lines"]
        assert line["product"]["id"] == product.product_id
        assert (line["size"], line["quantity"]) == ("M", 2)
        assert line["unit_price_cents"] == product.price_cents
        assert line["line_total_cents"] == 2 * product.price_cents
        assert (body["item_count"], body["subtotal_cents"]) == (2, 2 * product.price_cents)
        cookie = next(
            c for c in response.headers.get_list("set-cookie") if c.startswith("lk_cart=")
        )
        assert "httponly" in cookie.lower()
        assert "path=/api/v1" in cookie.lower()
        # The same browser sees its cart on the next request.
        assert (await api.client.get(CART)).json()["item_count"] == 2


async def test_adding_the_same_product_and_size_adds_up_other_sizes_are_new_lines(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)

        await add_to_cart(api.client, product.product_id, size="M")
        await add_to_cart(api.client, product.product_id, size="M", quantity=2)
        response = await add_to_cart(api.client, product.product_id, size="L")

        lines = {(line["size"], line["quantity"]) for line in response.json()["lines"]}
        assert lines == {("M", 3), ("L", 1)}


async def test_size_must_be_one_of_the_products_sizes(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        shirt = pick(api)
        shoe = pick(api, footwear=True)
        await set_product(
            api.app.state.engine,
            pick(api, skip=3).product_id,
            master_category="Accessories",
            sub_category="Watches",
        )
        watch = pick(api, skip=3)

        no_size = await add_to_cart(api.client, shirt.product_id, size="")
        wrong_size = await add_to_cart(api.client, shoe.product_id, size="M")
        sized_watch = await add_to_cart(api.client, watch.product_id, size="M")
        plain_watch = await add_to_cart(api.client, watch.product_id, size="")
        good_shoe = await add_to_cart(api.client, shoe.product_id, size="9")

        assert no_size.status_code == wrong_size.status_code == sized_watch.status_code == 422
        assert no_size.json()["type"] == "urn:angel:problem:invalid-size"
        assert "XL" in no_size.json()["sizes"]
        assert "9" in wrong_size.json()["sizes"]
        assert sized_watch.json()["sizes"] == []
        assert plain_watch.status_code == good_shoe.status_code == 200


async def test_stock_is_validated_against_what_is_already_in_the_cart(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)  # 7 in stock

        too_many = await add_to_cart(api.client, product.product_id, quantity=8)
        await add_to_cart(api.client, product.product_id, quantity=5)
        cumulative = await add_to_cart(api.client, product.product_id, quantity=3)
        fits = await add_to_cart(api.client, product.product_id, quantity=2)

        assert too_many.status_code == 409
        assert too_many.json()["type"] == "urn:angel:problem:insufficient-stock"
        assert too_many.json()["available"] == 7
        assert cumulative.status_code == 409
        assert fits.json()["item_count"] == 7


async def test_a_single_line_is_capped_at_the_per_line_limit_even_with_plenty_of_stock(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)
        await set_product(api.app.state.engine, product.product_id, stock_quantity=500)

        response = await add_to_cart(api.client, product.product_id, quantity=11)

        assert response.status_code == 409
        assert response.json()["available"] == api.settings.cart_max_quantity


async def test_sold_out_unknown_and_inactive_products_cannot_be_added(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        sold_out = pick(api, in_stock=False)
        withdrawn = pick(api)
        await set_product(api.app.state.engine, withdrawn.product_id, is_active=False)

        sold = await add_to_cart(api.client, sold_out.product_id)
        gone = await add_to_cart(api.client, withdrawn.product_id)
        unknown = await add_to_cart(api.client, 999_999)

        assert sold.status_code == 409
        assert sold.json()["available"] == 0
        assert gone.status_code == unknown.status_code == 404
        assert unknown.json()["type"] == "urn:angel:problem:product-not-found"


async def test_input_is_validated(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product = pick(api)
        bad = [
            {"product_id": product.product_id, "size": "M", "quantity": 0},
            {"product_id": product.product_id, "size": "M", "quantity": 100},
            {"product_id": product.product_id, "size": "M" * 17},
            {"product_id": 0, "size": "M"},
            {"product_id": product.product_id, "size": "M", "price_cents": 1},
            {"size": "M"},
        ]

        codes = [(await api.client.post(f"{CART}/items", json=body)).status_code for body in bad]

        assert codes == [422] * len(bad)


async def test_quantity_can_be_changed_and_lines_removed(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product = pick(api)
        other = pick(api, skip=1)
        await add_to_cart(api.client, product.product_id, quantity=2)
        cart = (await add_to_cart(api.client, other.product_id)).json()
        first, second = cart["lines"]

        changed = await api.client.patch(f"{CART}/items/{first['id']}", json={"quantity": 5})
        too_many = await api.client.patch(f"{CART}/items/{first['id']}", json={"quantity": 8})
        removed = await api.client.delete(f"{CART}/items/{second['id']}")
        cleared = await api.client.delete(CART)

        changed_first = changed.json()["lines"][0]
        assert (changed_first["id"], changed_first["quantity"]) == (first["id"], 5)
        assert too_many.status_code == 409
        assert too_many.json()["available"] == 7
        assert [line["id"] for line in removed.json()["lines"]] == [first["id"]]
        assert cleared.json()["lines"] == []


async def test_nobody_can_touch_another_visitors_cart_lines(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product = pick(api)
        mine = (await add_to_cart(api.client, product.product_id)).json()["lines"][0]["id"]

        async with another_client(api) as stranger:
            await add_to_cart(stranger, product.product_id)
            patch = await stranger.patch(f"{CART}/items/{mine}", json={"quantity": 3})
            delete = await stranger.delete(f"{CART}/items/{mine}")

        assert patch.status_code == delete.status_code == 404
        assert patch.json()["type"] == "urn:angel:problem:cart-item-not-found"
        assert (await api.client.get(CART)).json()["lines"][0]["quantity"] == 1


async def test_the_cart_shows_live_prices_and_flags_lines_that_went_out_of_stock(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)
        await add_to_cart(api.client, product.product_id, quantity=5)
        engine = api.app.state.engine

        await set_product(engine, product.product_id, price_cents=2500)
        repriced = (await api.client.get(CART)).json()
        await set_product(engine, product.product_id, stock_quantity=3)
        low = (await api.client.get(CART)).json()
        await set_product(engine, product.product_id, stock_quantity=0)
        sold_out = (await api.client.get(CART)).json()
        await set_product(engine, product.product_id, stock_quantity=9, is_active=False)
        withdrawn = (await api.client.get(CART)).json()

        assert repriced["subtotal_cents"] == 5 * 2500
        assert repriced["has_issues"] is False
        assert (low["lines"][0]["issue"], low["lines"][0]["max_quantity"]) == ("low_stock", 3)
        assert low["has_issues"] is True
        assert sold_out["lines"][0]["issue"] == "out_of_stock"
        assert withdrawn["lines"][0]["issue"] == "out_of_stock"
        assert withdrawn["lines"][0]["product"]["id"] == product.product_id  # still renders


async def test_concurrent_adds_neither_duplicate_the_line_nor_lose_an_increment(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)
        await set_product(api.app.state.engine, product.product_id, stock_quantity=500)
        await add_to_cart(api.client, product.product_id)  # creates the cart and its cookie

        responses = await asyncio.gather(
            *(add_to_cart(api.client, product.product_id) for _ in range(9))
        )

        assert {r.status_code for r in responses} == {200}
        [line] = (await api.client.get(CART)).json()["lines"]
        assert line["quantity"] == 10


async def test_a_bad_access_token_is_an_error_not_a_silent_guest_cart(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)

        response = await add_to_cart(api.client, product.product_id, token="expired.or.bad")

        assert response.status_code == 401


async def test_cart_changes_from_another_site_are_refused(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product = pick(api)

        response = await api.client.post(
            f"{CART}/items",
            json={"product_id": product.product_id, "size": "M"},
            headers={"Origin": "https://evil.example"},
        )

        assert response.status_code == 403


# --- guest cart meets account ----------------------------------------------------------------


async def test_signed_in_cart_is_the_users_and_survives_a_new_browser(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        product = pick(api)
        shopper = await register(api.client)
        await add_to_cart(api.client, product.product_id, quantity=2, token=shopper.token)

        async with another_client(api) as phone:
            login = await phone.post(
                "/api/v1/auth/login", json={"email": shopper.email, "password": PASSWORD}
            )
            token = login.json()["access_token"]
            cart = await phone.get(CART, headers={"Authorization": f"Bearer {token}"})

        assert cart.json()["item_count"] == 2


async def test_login_merges_the_guest_cart_into_the_account_cart(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        shared, only_guest = pick(api), pick(api, skip=1)
        email = unique_email()
        async with another_client(api) as first_visit:
            shopper = await register(first_visit, email)
            await add_to_cart(first_visit, shared.product_id, quantity=3, token=shopper.token)

        # Later, on this browser, as a guest.
        await add_to_cart(api.client, shared.product_id, quantity=2)
        await add_to_cart(api.client, only_guest.product_id)

        login = await api.client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
        )

        assert login.status_code == 200
        token = login.json()["access_token"]
        merged = (await api.client.get(CART, headers={"Authorization": f"Bearer {token}"})).json()
        quantities = {line["product"]["id"]: line["quantity"] for line in merged["lines"]}
        assert quantities == {shared.product_id: 5, only_guest.product_id: 1}
        # The guest cart is gone, and so is its cookie: signed out, this browser starts empty.
        assert (await api.client.get(CART)).json()["lines"] == []
        async with api.app.state.engine.connect() as connection:
            guests = (
                await connection.execute(text("SELECT count(*) FROM carts WHERE user_id IS NULL"))
            ).scalar_one()
        assert guests == 0


async def test_merging_never_goes_beyond_stock(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product = pick(api)
        email = unique_email()
        async with another_client(api) as first_visit:
            shopper = await register(first_visit, email)
            await add_to_cart(first_visit, product.product_id, quantity=3, token=shopper.token)
        await add_to_cart(api.client, product.product_id, quantity=3)
        await set_product(api.app.state.engine, product.product_id, stock_quantity=4)

        login = await api.client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
        )

        token = login.json()["access_token"]
        merged = (await api.client.get(CART, headers={"Authorization": f"Bearer {token}"})).json()
        assert merged["lines"][0]["quantity"] == 4
        assert merged["has_issues"] is False


async def test_registering_with_a_guest_cart_keeps_it(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product = pick(api)
        await add_to_cart(api.client, product.product_id, quantity=2)

        shopper = await register(api.client)

        cart = await api.client.get(CART, headers=shopper.auth)
        assert cart.json()["item_count"] == 2


async def test_a_failed_login_leaves_the_guest_cart_alone(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        product = pick(api)
        await add_to_cart(api.client, product.product_id, quantity=2)

        failed = await api.client.post(
            "/api/v1/auth/login", json={"email": unique_email(), "password": PASSWORD}
        )

        assert failed.status_code == 401
        assert (await api.client.get(CART)).json()["item_count"] == 2
