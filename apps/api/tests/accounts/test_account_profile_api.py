import pytest
from httpx import AsyncClient, Response
from sqlalchemy import text

from tests.conftest import Api, ApiFactory
from tests.support.commerce import (
    PASSWORD,
    add_address,
    add_to_cart,
    another_client,
    checkout,
    register,
    unique_email,
)

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ME = "/api/v1/auth/me"
PASSWORD_URL = "/api/v1/auth/password"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
NEW_PASSWORD = "a brand new passphrase"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def google_session(client: AsyncClient, email: str) -> str:
    """Signs in with the fake Google through the whole flow; returns an access token."""
    start = await client.get("/api/v1/auth/google/start", params={"login_hint": email})
    assert start.status_code == 302
    location = start.headers["location"].split("localhost:3000", 1)[1]
    await client.get(location)
    refreshed = await client.post(REFRESH)
    assert refreshed.status_code == 200, refreshed.text
    token: str = refreshed.json()["access_token"]
    return token


async def scalar(api: Api, sql: str, **params: object) -> object:
    async with api.app.state.engine.connect() as connection:
        return (await connection.execute(text(sql), params)).scalar_one()


# --- name --------------------------------------------------------------------------------------


async def test_a_person_can_rename_their_account(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)

        response = await api.client.patch(
            ME, json={"full_name": "  Ada B. Lovelace "}, headers=shopper.auth
        )

        assert response.status_code == 200
        assert response.json()["full_name"] == "Ada B. Lovelace"
        assert (await api.client.get(ME, headers=shopper.auth)).json()[
            "full_name"
        ] == "Ada B. Lovelace"


@pytest.mark.parametrize(
    "body", [{"full_name": ""}, {"full_name": "x" * 121}, {"email": "a@b.co"}, {}]
)
async def test_a_bad_rename_is_refused(api_factory: ApiFactory, body: dict[str, str]) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)

        response = await api.client.patch(ME, json=body, headers=shopper.auth)

        assert response.status_code == 422


async def test_renaming_needs_a_session(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        assert (await api.client.patch(ME, json={"full_name": "x"})).status_code == 401


# --- password ----------------------------------------------------------------------------------


async def test_changing_the_password_ends_every_other_login(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        email = unique_email()
        async with another_client(api) as phone:
            await register(phone, email)
            phone_cookie = phone.cookies.get("lk_refresh", path="/api/v1/auth")
        async with another_client(api) as laptop:
            login = await laptop.post(LOGIN, json={"email": email, "password": PASSWORD})
            token = login.json()["access_token"]

            changed = await laptop.put(
                PASSWORD_URL,
                json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
                headers=bearer(token),
            )

            assert changed.status_code == 200
            body = changed.json()
            assert body["user"]["email"] == email
            # This browser carries on with a new session...
            assert (await laptop.get(ME, headers=bearer(body["access_token"]))).status_code == 200
            assert (await laptop.post(REFRESH)).status_code == 200
        # ... the phone's login is over, and so is the old password.
        async with another_client(api, refresh_token=phone_cookie) as phone_again:
            assert (await phone_again.post(REFRESH)).status_code == 401
        assert (
            await api.client.post(LOGIN, json={"email": email, "password": PASSWORD})
        ).status_code == 401
        assert (
            await api.client.post(LOGIN, json={"email": email, "password": NEW_PASSWORD})
        ).status_code == 200


async def test_the_current_password_must_be_right_and_that_is_not_a_401(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)

        wrong = await api.client.put(
            PASSWORD_URL,
            json={"current_password": "not it at all", "new_password": NEW_PASSWORD},
            headers=shopper.auth,
        )
        missing = await api.client.put(
            PASSWORD_URL, json={"new_password": NEW_PASSWORD}, headers=shopper.auth
        )

        # 403: they are signed in. A 401 would make the web app think the session expired.
        assert wrong.status_code == missing.status_code == 403
        assert wrong.json()["title"] == "Incorrect password"
        assert (
            await api.client.post(LOGIN, json={"email": shopper.email, "password": PASSWORD})
        ).status_code == 200


async def test_the_new_password_follows_the_same_rules_as_registering(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)

        response = await api.client.put(
            PASSWORD_URL,
            json={"current_password": PASSWORD, "new_password": "short"},
            headers=shopper.auth,
        )

        assert response.status_code == 422


async def test_wrong_current_passwords_are_counted_and_stop_after_a_few(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, rate_limit_login_email="2/60") as api:
        shopper = await register(api.client)
        attempt = {"current_password": "not it at all", "new_password": NEW_PASSWORD}

        codes = [
            (await api.client.put(PASSWORD_URL, json=attempt, headers=shopper.auth)).status_code
            for _ in range(3)
        ]

        assert codes == [403, 403, 429]


async def test_a_google_account_can_add_a_password_and_then_use_it(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        token = await google_session(api.client, email)
        before = (await api.client.get(ME, headers=bearer(token))).json()
        assert (before["has_password"], before["providers"]) == (False, ["google"])

        response = await api.client.put(
            PASSWORD_URL, json={"new_password": NEW_PASSWORD}, headers=bearer(token)
        )

        assert response.status_code == 200
        after = response.json()["user"]
        assert (after["has_password"], after["providers"]) == (True, ["google"])
        login = await api.client.post(LOGIN, json={"email": email, "password": NEW_PASSWORD})
        assert login.status_code == 200


# --- Google details ----------------------------------------------------------------------------


async def test_the_google_photo_is_kept_and_follows_the_latest_one(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        first = await google_session(api.client, f"{email};picture=https://example.com/a.png")
        assert (await api.client.get(ME, headers=bearer(first))).json()[
            "avatar_url"
        ] == "https://example.com/a.png"

        async with another_client(api) as later:
            second = await google_session(later, f"{email};picture=https://example.com/b.png")
            assert (await later.get(ME, headers=bearer(second))).json()[
                "avatar_url"
            ] == "https://example.com/b.png"


async def test_no_photo_means_no_avatar(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        token = await google_session(api.client, unique_email())

        assert (await api.client.get(ME, headers=bearer(token))).json()["avatar_url"] is None


# --- deletion ----------------------------------------------------------------------------------


async def delete(client: AsyncClient, token: str, **body: str) -> Response:
    return await client.request("DELETE", ME, json=body, headers=bearer(token))


async def test_deleting_an_account_anonymizes_it_and_keeps_the_orders(
    api_factory: ApiFactory,
) -> None:
    async with api_factory() as api:
        shopper = await register(api.client)
        address = await add_address(shopper)
        product = next(e for e in api.entries if e.in_stock)
        await add_to_cart(api.client, product.product_id, token=shopper.token)
        assert (await checkout(shopper, address)).status_code in (200, 201)
        await api.client.put(f"/api/v1/wishlist/{product.product_id}", headers=shopper.auth)

        response = await api.client.request(
            "DELETE",
            ME,
            json={"confirm_email": shopper.email.upper(), "password": PASSWORD},
            headers=shopper.auth,
        )

        assert response.status_code == 204
        cookies = " ".join(response.headers.get_list("set-cookie"))
        assert "lk_refresh=" in cookies
        assert "Max-Age=0" in cookies
        row = await scalar(
            api,
            "SELECT email || '|' || full_name || '|' || is_active::text FROM users WHERE id = :i",
            i=shopper.user_id,
        )
        assert row == f"deleted-{shopper.user_id}@deleted.invalid|Deleted user|false"
        for table in ("addresses", "wishlist_items", "carts", "refresh_tokens"):
            assert (
                await scalar(
                    api,
                    f"SELECT count(*) FROM {table} WHERE user_id = :i",  # noqa: S608 - fixed table names
                    i=shopper.user_id,
                )
                == 0
            )
        assert (
            await scalar(api, "SELECT count(*) FROM orders WHERE user_id = :i", i=shopper.user_id)
            == 1
        )
        # Nobody can use the account any more, and the address can be registered afresh.
        assert (
            await api.client.post(LOGIN, json={"email": shopper.email, "password": PASSWORD})
        ).status_code == 401
        assert (await api.client.get(ME, headers=shopper.auth)).status_code == 401
        assert (await api.client.post(REFRESH)).status_code == 401
        again = await api.client.post(
            "/api/v1/auth/register",
            json={"email": shopper.email, "password": PASSWORD, "full_name": "New"},
        )
        assert again.status_code == 201


async def test_deleting_needs_the_typed_email_and_the_password(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)

        wrong_email = await delete(
            api.client, shopper.token, confirm_email="someone@else.com", password=PASSWORD
        )
        wrong_password = await delete(
            api.client, shopper.token, confirm_email=shopper.email, password="nope nope nope"
        )
        no_password = await delete(api.client, shopper.token, confirm_email=shopper.email)

        assert wrong_email.status_code == 422
        assert wrong_password.status_code == no_password.status_code == 403
        assert (await api.client.get(ME, headers=shopper.auth)).status_code == 200


async def test_a_google_only_account_deletes_with_just_the_typed_email(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, oauth_mode="fake") as api:
        email = unique_email()
        token = await google_session(api.client, email)

        response = await delete(api.client, token, confirm_email=email)

        assert response.status_code == 204
        assert await scalar(api, "SELECT count(*) FROM oauth_identities") == 0
        assert (await api.client.get(ME, headers=bearer(token))).status_code == 401


async def test_an_administrator_cannot_delete_their_account_here(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        async with api.app.state.engine.begin() as connection:
            await connection.execute(
                text("UPDATE users SET role = 'admin' WHERE id = :i"), {"i": shopper.user_id}
            )

        response = await delete(
            api.client, shopper.token, confirm_email=shopper.email, password=PASSWORD
        )

        assert response.status_code == 403
        assert (await api.client.get(ME, headers=shopper.auth)).status_code == 200
