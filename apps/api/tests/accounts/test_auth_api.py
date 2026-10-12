import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import Response
from sqlalchemy import text

from angel.core.security import create_access_token
from tests.conftest import ApiFactory
from tests.support.commerce import PASSWORD, another_client, register, unique_email

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
ME = "/api/v1/auth/me"


def without_request_id(response: Response) -> dict[str, object]:
    return {k: v for k, v in response.json().items() if k != "request_id"}


async def test_register_signs_the_user_in(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(
            REGISTER,
            json={"email": " Ada@Example.COM ", "password": PASSWORD, "full_name": " Ada "},
        )

        body = response.json()
        assert response.status_code == 201
        assert body["user"] == {
            "id": body["user"]["id"],
            "email": "ada@example.com",
            "full_name": "Ada",
            "role": "customer",
            "avatar_url": None,
            "has_password": True,
            "providers": [],
        }
        assert body["token_type"] == "bearer"
        assert body["expires_in"] == api.settings.access_token_ttl_seconds
        # Neither the password nor its hash comes back (`has_password` is only a flag).
        assert PASSWORD not in response.text
        assert "password_hash" not in response.text
        me = await api.client.get(ME, headers={"Authorization": f"Bearer {body['access_token']}"})
        assert me.status_code == 200
        assert me.json()["email"] == "ada@example.com"
        assert response.headers["cache-control"] == "no-store"


async def test_refresh_token_is_an_httponly_scoped_cookie_never_in_the_body(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(
            REGISTER, json={"email": unique_email(), "password": PASSWORD, "full_name": "Ada"}
        )

        cookies = {c.split("=", 1)[0]: c for c in response.headers.get_list("set-cookie")}
        refresh = cookies["lk_refresh"].lower()
        assert "httponly" in refresh
        assert "samesite=lax" in refresh
        assert "path=/api/v1/auth" in refresh
        assert "max-age=" in refresh
        assert "httponly" not in cookies["lk_session"].lower()  # readable by the edge proxy
        assert "refresh" not in response.json()
        assert "secure" not in refresh  # plain http in tests; forced on in prod (see config tests)


async def test_register_rejects_duplicates_weak_passwords_and_bad_emails(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        email = unique_email()
        await register(api.client, email)

        duplicate = await api.client.post(
            REGISTER, json={"email": email.upper(), "password": PASSWORD, "full_name": "Eve"}
        )
        short = await api.client.post(
            REGISTER, json={"email": unique_email(), "password": "short", "full_name": "Eve"}
        )
        bad_email = await api.client.post(
            REGISTER, json={"email": "not-an-email", "password": PASSWORD, "full_name": "Eve"}
        )
        extra = await api.client.post(
            REGISTER,
            json={
                "email": unique_email(),
                "password": PASSWORD,
                "full_name": "E",
                "is_admin": True,
            },
        )

        assert duplicate.status_code == 409
        assert duplicate.json()["type"] == "urn:angel:problem:email-taken"
        assert short.status_code == bad_email.status_code == extra.status_code == 422


async def test_passwords_are_stored_as_argon2_hashes(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)

        async with api.app.state.engine.connect() as connection:
            stored = (
                await connection.execute(
                    text("SELECT password_hash FROM users WHERE id = :id"), {"id": shopper.user_id}
                )
            ).scalar_one()
        assert stored.startswith("$argon2id$")
        assert PASSWORD not in stored


async def test_login_succeeds_and_fails_with_the_same_error_for_unknown_and_wrong(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        email = unique_email()
        await register(api.client, email)
        async with another_client(api) as browser:
            ok = await browser.post(LOGIN, json={"email": email.upper(), "password": PASSWORD})
            wrong = await browser.post(LOGIN, json={"email": email, "password": "wrong-password!"})
            unknown = await browser.post(
                LOGIN, json={"email": unique_email(), "password": PASSWORD}
            )

        assert ok.status_code == 200
        assert wrong.status_code == unknown.status_code == 401
        assert wrong.json()["type"] == "urn:angel:problem:invalid-credentials"
        # Not even the request id differs between "no such user" and "wrong password".
        assert without_request_id(wrong) == without_request_id(unknown)


async def test_failed_logins_for_one_email_are_limited_and_success_resets_the_count(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0, rate_limit_login_email="3/300") as api:
        email = unique_email()
        await register(api.client, email)
        async with another_client(api) as browser:
            for _ in range(3):
                response = await browser.post(
                    LOGIN, json={"email": email, "password": "nope-nope-nope"}
                )
                assert response.status_code == 401
            locked = await browser.post(LOGIN, json={"email": email, "password": PASSWORD})

        assert locked.status_code == 429
        assert locked.headers["retry-after"]
        assert locked.json()["type"] == "urn:angel:problem:rate-limited"

    async with api_factory(seed_count=0, rate_limit_login_email="3/300") as api:
        email = unique_email()
        await register(api.client, email)
        async with another_client(api) as browser:
            for _ in range(2):
                await browser.post(LOGIN, json={"email": email, "password": "nope-nope-nope"})
            assert (
                await browser.post(LOGIN, json={"email": email, "password": PASSWORD})
            ).status_code == 200
            for _ in range(2):  # the counter started again from zero
                assert (
                    await browser.post(LOGIN, json={"email": email, "password": "nope-nope-nope"})
                ).status_code == 401


async def test_login_is_rate_limited_per_address(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, rate_limit_login="2/60") as api:
        codes = [
            (
                await api.client.post(LOGIN, json={"email": unique_email(), "password": PASSWORD})
            ).status_code
            for _ in range(3)
        ]

        assert codes == [401, 401, 429]


async def test_refresh_rotates_the_token_and_returns_a_working_access_token(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        first_cookie = api.client.cookies.get("lk_refresh")

        refreshed = await api.client.post(REFRESH)

        assert refreshed.status_code == 200
        assert api.client.cookies.get("lk_refresh") != first_cookie
        me = await api.client.get(
            ME, headers={"Authorization": f"Bearer {refreshed.json()['access_token']}"}
        )
        assert me.json()["id"] == shopper.user_id


async def test_replaying_a_used_refresh_token_revokes_the_whole_session(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        await register(api.client)
        stolen = api.client.cookies.get("lk_refresh")
        await api.client.post(REFRESH)  # the legitimate rotation
        assert stolen is not None
        # Beyond the grace window a reused token is theft, not a double click.
        async with api.app.state.engine.begin() as connection:
            await connection.execute(
                text(
                    "UPDATE refresh_tokens SET used_at = now() - interval '1 hour' "
                    "WHERE used_at IS NOT NULL"
                )
            )

        async with another_client(api, refresh_token=stolen) as thief:
            replay = await thief.post(REFRESH)
        rotated = await api.client.post(REFRESH)  # the victim's newest token is dead too

        assert replay.status_code == 401
        assert rotated.status_code == 401
        async with api.app.state.engine.connect() as connection:
            live = (
                await connection.execute(
                    text("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NULL")
                )
            ).scalar_one()
        assert live == 0


async def test_a_double_refresh_within_the_grace_window_is_not_treated_as_theft(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        await register(api.client)
        token = api.client.cookies.get("lk_refresh")
        assert token is not None

        async with (
            another_client(api, refresh_token=token) as first_tab,
            another_client(api, refresh_token=token) as second_tab,
        ):
            first = await first_tab.post(REFRESH)
            second = await second_tab.post(REFRESH)
            # The winner holds the rotated token: the session is alive.
            still_signed_in = await first_tab.post(REFRESH)

        assert first.status_code == 200
        assert second.status_code == 401  # rejected, but not treated as theft
        assert still_signed_in.status_code == 200


async def test_concurrent_refreshes_with_one_token_issue_exactly_one_new_token(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        await register(api.client)
        token = api.client.cookies.get("lk_refresh")
        assert token is not None

        async def attempt() -> int:
            async with another_client(api, refresh_token=token) as browser:
                return (await browser.post(REFRESH)).status_code

        codes = sorted(await asyncio.gather(*(attempt() for _ in range(4))))

        assert codes == [200, 401, 401, 401]


async def test_expired_refresh_token_is_rejected(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        await register(api.client)
        async with api.app.state.engine.begin() as connection:
            await connection.execute(
                text("UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'")
            )

        assert (await api.client.post(REFRESH)).status_code == 401


async def test_refresh_without_a_cookie_is_401(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(REFRESH)

        assert response.status_code == 401
        assert response.json()["type"] == "urn:angel:problem:unauthenticated"


async def test_logout_ends_the_session_and_clears_cookies(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        await register(api.client)
        token = api.client.cookies.get("lk_refresh")
        assert token is not None

        response = await api.client.post(LOGOUT)

        assert response.status_code == 204
        cleared = " ".join(response.headers.get_list("set-cookie")).lower()
        assert "lk_refresh=" in cleared
        assert "max-age=0" in cleared
        async with another_client(api, refresh_token=token) as browser:
            assert (await browser.post(REFRESH)).status_code == 401
        assert (await api.client.post(LOGOUT)).status_code == 204  # idempotent


async def test_protected_endpoints_need_a_valid_unexpired_token(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        expired = create_access_token(
            shopper.user_id,
            api.settings.jwt_secret,
            60,
            now=datetime.now(UTC) - timedelta(hours=1),
        ).value

        missing = await api.client.get(ME)
        garbage = await api.client.get(ME, headers={"Authorization": "Bearer nonsense"})
        old = await api.client.get(ME, headers={"Authorization": f"Bearer {expired}"})
        orders = await api.client.get("/api/v1/orders")

        assert [r.status_code for r in (missing, garbage, old, orders)] == [401, 401, 401, 401]
        assert missing.headers["www-authenticate"] == "Bearer"
        assert missing.json()["type"] == "urn:angel:problem:unauthenticated"


async def test_cookie_endpoints_refuse_cross_site_requests(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        await register(api.client)

        evil = await api.client.post(REFRESH, headers={"Origin": "https://evil.example"})
        fetch_metadata = await api.client.post(REFRESH, headers={"Sec-Fetch-Site": "cross-site"})
        ours = await api.client.post(REFRESH, headers={"Origin": "http://localhost:3000"})

        assert evil.status_code == 403
        assert evil.json()["type"] == "urn:angel:problem:forbidden-origin"
        assert fetch_metadata.status_code == 403
        assert ours.status_code == 200


async def test_responses_carry_security_headers(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.get("/healthz")

        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["referrer-policy"] == "no-referrer"
