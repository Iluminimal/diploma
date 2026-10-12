import uuid

import pytest

from angel.services.accounts.devices import describe_device
from tests.conftest import ApiFactory
from tests.support.commerce import PASSWORD, Shopper, another_client, register

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

SESSIONS = "/api/v1/auth/sessions"
CHROME_MAC = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
SAFARI_IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)


@pytest.mark.parametrize(
    ("agent", "label"),
    [
        (CHROME_MAC, "Chrome on macOS"),
        (SAFARI_IPHONE, "Safari on iPhone"),
        ("Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/127.0", "Firefox on Windows"),
        ("Mozilla/5.0 (Windows NT 10.0) Chrome/126 Safari/537 Edg/126", "Edge on Windows"),
        ("curl/8.7.1", "Unknown device"),
        (None, "Unknown device"),
    ],
)
def test_a_browser_gets_a_readable_label(agent: str | None, label: str) -> None:
    assert describe_device(agent) == label


async def login_from(api_client, email: str, agent: str, shopper: Shopper) -> Shopper:  # type: ignore[no-untyped-def]
    response = await api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
        headers={"User-Agent": agent},
    )
    assert response.status_code == 200, response.text
    return Shopper(api_client, response.json()["access_token"], shopper.user_id, email)


async def test_each_login_is_listed_with_its_device_and_the_current_one_is_marked(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        first = await register(api.client)
        async with another_client(api) as phone:
            second = await login_from(phone, first.email, SAFARI_IPHONE, first)

            listed = await second.client.get(SESSIONS, headers=second.auth)

        sessions = listed.json()
        assert listed.status_code == 200
        assert len(sessions) == 2
        assert [s["device"] for s in sessions if s["current"]] == ["Safari on iPhone"]
        assert sorted(s["current"] for s in sessions) == [False, True]
        assert all(s["created_at"] <= s["last_used_at"] for s in sessions)
        assert "token" not in listed.text


async def test_refreshing_does_not_add_a_session(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        refreshed = await api.client.post("/api/v1/auth/refresh")
        token = refreshed.json()["access_token"]

        listed = await api.client.get(SESSIONS, headers={"Authorization": f"Bearer {token}"})

        assert len(listed.json()) == 1
        assert listed.json()[0]["current"] is True
        assert shopper.user_id


async def test_one_device_can_be_signed_out(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        first = await register(api.client)
        refresh = api.client.cookies.get("lk_refresh")
        async with another_client(api) as phone:
            second = await login_from(phone, first.email, SAFARI_IPHONE, first)
            listed = (await second.client.get(SESSIONS, headers=second.auth)).json()
            other = next(s for s in listed if not s["current"])

            ended = await second.client.delete(f"{SESSIONS}/{other['id']}", headers=second.auth)
            after = (await second.client.get(SESSIONS, headers=second.auth)).json()

        assert ended.status_code == 204
        assert [s["current"] for s in after] == [True]
        async with another_client(api, refresh_token=refresh) as old_browser:
            assert (await old_browser.post("/api/v1/auth/refresh")).status_code == 401


async def test_signing_out_this_device_clears_its_cookies(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        listed = (await api.client.get(SESSIONS, headers=shopper.auth)).json()

        ended = await api.client.delete(f"{SESSIONS}/{listed[0]['id']}", headers=shopper.auth)

        assert ended.status_code == 204
        assert "lk_refresh=" in ended.headers["set-cookie"]
        assert (await api.client.post("/api/v1/auth/refresh")).status_code == 401


async def test_sign_out_everywhere_else_keeps_this_browser(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        first = await register(api.client)
        async with another_client(api) as phone:
            await login_from(phone, first.email, SAFARI_IPHONE, first)
            async with another_client(api) as laptop:
                await login_from(laptop, first.email, CHROME_MAC, first)

                ended = await api.client.post(f"{SESSIONS}/revoke-others", headers=first.auth)
                remaining = (await api.client.get(SESSIONS, headers=first.auth)).json()

                assert ended.status_code == 204
                assert [s["current"] for s in remaining] == [True]
                assert (await phone.post("/api/v1/auth/refresh")).status_code == 401
                assert (await laptop.post("/api/v1/auth/refresh")).status_code == 401
        assert (await api.client.post("/api/v1/auth/refresh")).status_code == 200


async def test_nobody_can_end_someone_elses_login(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        victim = await register(api.client)
        victims = (await api.client.get(SESSIONS, headers=victim.auth)).json()
        async with another_client(api) as client:
            attacker = await register(client)

            response = await client.delete(f"{SESSIONS}/{victims[0]['id']}", headers=attacker.auth)
            missing = await client.delete(f"{SESSIONS}/{uuid.uuid4()}", headers=attacker.auth)

        assert (response.status_code, missing.status_code) == (404, 404)
        assert (await api.client.post("/api/v1/auth/refresh")).status_code == 200


async def test_the_device_list_needs_a_signed_in_user(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        listed = await api.client.get(SESSIONS)
        revoked = await api.client.post(f"{SESSIONS}/revoke-others")

        assert (listed.status_code, revoked.status_code) == (401, 401)
