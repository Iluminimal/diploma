from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.commerce import PASSWORD, another_client, register, set_role, unique_email
from tests.conftest import Api, ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

START = "/api/v1/auth/google/start"
CALLBACK = "/api/v1/auth/google/callback"
PROVIDERS = "/api/v1/auth/providers"
REFRESH = "/api/v1/auth/refresh"
WEB = "http://localhost:3000"


async def start(client: AsyncClient, email: str | None = None, **params: str) -> Response:
    query = {**params, **({"login_hint": email} if email else {})}
    return await client.get(START, params=query)


def callback_target(start_response: Response) -> str:
    """The path and query the fake Google sends the browser back to."""
    location = urlparse(start_response.headers["location"])
    return f"{location.path}?{location.query}"


async def sign_in(client: AsyncClient, email: str | None = None, **params: str) -> Response:
    """The whole round trip a browser makes: start, 'Google', callback."""
    first = await start(client, email, **params)
    assert first.status_code == 302, first.text
    return await client.get(callback_target(first))


async def who_am_i(client: AsyncClient) -> dict[str, object]:
    """Trade the refresh cookie the callback set for a session, like the web app does on load."""
    response = await client.post(REFRESH)
    assert response.status_code == 200, response.text
    user: dict[str, object] = response.json()["user"]
    return user


def error_of(response: Response) -> str:
    assert response.status_code == 302
    location = urlparse(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == f"{WEB}/login"
    return parse_qs(location.query)["error"][0]


async def scalar(api: Api, sql: str, **params: object) -> object:
    async with api.app.state.engine.connect() as connection:
        return (await connection.execute(text(sql), params)).scalar_one()


async def test_the_providers_endpoint_says_whether_google_is_on(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as on:
        assert (await on.client.get(PROVIDERS)).json() == {"google": True}
    async with api_factory(seed_count=0) as off:
        assert (await off.client.get(PROVIDERS)).json() == {"google": False}
        assert (await start(off.client)).status_code == 404


async def test_start_sends_the_browser_to_google_with_a_signed_httponly_flow_cookie(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        response = await start(api.client, next="/account")

        assert response.status_code == 302
        assert response.headers["cache-control"] == "no-store"
        cookie = next(
            c for c in response.headers.get_list("set-cookie") if c.startswith("lk_oauth=")
        )
        assert {"httponly", "samesite=lax", "path=/api/v1/auth/google"} <= {
            part.strip().lower() for part in cookie.split(";")
        }
        assert "max-age=600" in cookie.lower()


async def test_signing_in_with_google_creates_an_account_without_a_password(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()

        response = await sign_in(api.client, email)

        assert response.status_code == 302
        assert response.headers["location"] == f"{WEB}/"
        cookies = {c.split("=", 1)[0] for c in response.headers.get_list("set-cookie")}
        assert {"lk_refresh", "lk_session", "lk_oauth", "lk_cart"} <= cookies
        user = await who_am_i(api.client)
        assert user["email"] == email
        assert user["role"] == "customer"
        assert await scalar(
            api, "SELECT password_hash IS NULL FROM users WHERE email = :e", e=email
        )
        assert await scalar(api, "SELECT count(*) FROM oauth_identities") == 1


async def test_the_same_google_account_is_the_same_user_next_time(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        await sign_in(api.client, email)
        first = await who_am_i(api.client)

        async with another_client(api) as elsewhere:
            await sign_in(elsewhere, email)
            second = await who_am_i(elsewhere)

        assert first["id"] == second["id"]
        assert await scalar(api, "SELECT count(*) FROM users") == 1
        assert await scalar(api, "SELECT count(*) FROM oauth_identities") == 1


async def test_a_google_email_that_has_a_password_account_links_and_removes_the_password(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        async with another_client(api) as squatter:
            shopper = await register(squatter, email)

        response = await sign_in(api.client, email)

        assert response.headers["location"] == f"{WEB}/"
        user = await who_am_i(api.client)
        assert user["id"] == shopper.user_id
        assert await scalar(api, "SELECT count(*) FROM users") == 1
        assert await scalar(api, "SELECT count(*) FROM oauth_identities") == 1
        # Whoever knew the password no longer gets in with it.
        login = await api.client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
        )
        assert login.status_code == 401
        assert login.json()["title"] == "Invalid email or password"


async def test_password_login_for_a_google_only_account_looks_like_any_wrong_password(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        await sign_in(api.client, email)

        known = await api.client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
        )
        unknown = await api.client.post(
            "/api/v1/auth/login", json={"email": unique_email(), "password": PASSWORD}
        )

        assert known.status_code == unknown.status_code == 401
        assert known.json()["title"] == unknown.json()["title"]
        # And registering that email is still refused: the account exists.
        again = await api.client.post(
            "/api/v1/auth/register", json={"email": email, "password": PASSWORD, "full_name": "X"}
        )
        assert again.status_code == 409


async def test_the_guest_cart_follows_the_person_into_the_account(api_factory: ApiFactory) -> None:
    from tests.commerce import add_to_cart

    async with api_factory(oauth_mode="fake") as api:
        product = next(e for e in api.entries if e.in_stock)
        await add_to_cart(api.client, product.product_id, quantity=2)

        await sign_in(api.client, unique_email())

        token = (await api.client.post(REFRESH)).json()["access_token"]
        cart = (
            await api.client.get("/api/v1/cart", headers={"Authorization": f"Bearer {token}"})
        ).json()
        assert [(line["product"]["id"], line["quantity"]) for line in cart["lines"]] == [
            (product.product_id, 2)
        ]


@pytest.mark.parametrize(
    ("next_path", "expected"),
    [
        ("/account/orders", "/account/orders"),
        ("/products?q=red%20dress", "/products?q=red%20dress"),
        ("//evil.example", "/"),
        ("https://evil.example", "/"),
        ("/login", "/"),
        (None, "/"),
    ],
)
async def test_the_person_lands_where_they_came_from_and_never_on_another_site(
    api_factory: ApiFactory, next_path: str | None, expected: str
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        params = {"next": next_path} if next_path else {}

        response = await sign_in(api.client, unique_email(), **params)

        assert response.headers["location"] == f"{WEB}{expected}"


async def test_an_administrator_lands_in_the_admin_area_unless_they_asked_for_a_page(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        customer = await sign_in(api.client, email)
        user_id = await scalar(api, "SELECT id FROM users WHERE email = :e", e=email)
        await set_role(db_engine, int(str(user_id)), "admin")

        by_default = await sign_in(api.client, email)
        asked_for_orders = await sign_in(api.client, email, next="/account/orders")

        assert customer.headers["location"] == f"{WEB}/"
        assert by_default.headers["location"] == f"{WEB}/admin"
        assert asked_for_orders.headers["location"] == f"{WEB}/account/orders"


async def test_pressing_cancel_at_google_ends_on_the_login_page(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        await start(api.client)

        response = await api.client.get(CALLBACK, params={"error": "access_denied", "state": "x"})

        assert error_of(response) == "google_denied"
        assert "lk_refresh" not in response.headers.get("set-cookie", "")


async def test_other_errors_from_google_are_a_generic_failure(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        response = await api.client.get(CALLBACK, params={"error": "server_error"})

        assert error_of(response) == "google_failed"


async def test_an_unverified_google_email_is_refused_and_creates_nothing(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        response = await sign_in(api.client, f"unverified:{unique_email()}")

        assert error_of(response) == "google_unverified"
        assert await scalar(api, "SELECT count(*) FROM users") == 0
        assert (await api.client.post(REFRESH)).status_code == 401


async def test_a_callback_with_the_wrong_state_is_refused(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        first = await start(api.client, unique_email())
        target = callback_target(first).replace("state=", "state=forged")

        response = await api.client.get(target)

        assert error_of(response) == "google_failed"
        assert await scalar(api, "SELECT count(*) FROM users") == 0


async def test_a_callback_started_in_another_browser_is_refused(api_factory: ApiFactory) -> None:
    """The attacker's link, followed by a victim who never started a sign-in."""
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        attackers_link = callback_target(await start(api.client, unique_email()))

        async with another_client(api) as victim:
            response = await victim.get(attackers_link)

        assert error_of(response) == "google_failed"
        assert await scalar(api, "SELECT count(*) FROM users") == 0


async def test_a_callback_cannot_be_replayed(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        first = await start(api.client, unique_email())
        target = callback_target(first)
        assert (await api.client.get(target)).headers["location"] == f"{WEB}/"

        replay = await api.client.get(target)

        assert error_of(replay) == "google_failed"


async def test_a_disabled_account_cannot_sign_in_with_google(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        await sign_in(api.client, email)
        async with api.app.state.engine.begin() as connection:
            await connection.execute(text("UPDATE users SET is_active = false"))

        async with another_client(api) as elsewhere:
            response = await sign_in(elsewhere, email)

        assert error_of(response) == "account_disabled"


async def test_signing_in_twice_at_once_never_makes_two_users(api_factory: ApiFactory) -> None:
    import asyncio

    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        async with another_client(api) as a, another_client(api) as b:
            starts = [await start(a, email), await start(b, email)]
            results = await asyncio.gather(
                a.get(callback_target(starts[0])), b.get(callback_target(starts[1]))
            )

        assert all(r.status_code == 302 for r in results)
        assert await scalar(api, "SELECT count(*) FROM users") == 1
        assert await scalar(api, "SELECT count(*) FROM oauth_identities") == 1
