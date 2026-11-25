"""Бүртгэлийн аюулгүй байдлын журнал, шинэ төхөөрөмж, нууц үгийн мэдэгдэл, өдрийн хязгаар,
сул нууц үг, ажилтны session."""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from angel.core.passwords import weakness
from tests.conftest import Api, ApiFactory
from tests.support.commerce import PASSWORD, Shopper, another_client, register, set_role
from tests.support.fakes import RecordingMailer

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

EVENTS = "/api/v1/auth/security-events"
CHROME_MAC = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
SAFARI_IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)


async def login(api: Api, email: str, password: str = PASSWORD, agent: str = CHROME_MAC):  # type: ignore[no-untyped-def]
    return await api.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
        headers={"User-Agent": agent},
    )


async def events_of(shopper: Shopper) -> list[dict[str, object]]:
    response = await shopper.client.get(EVENTS, headers=shopper.auth)
    assert response.status_code == 200, response.text
    items: list[dict[str, object]] = response.json()
    return items


def types(items: list[dict[str, object]]) -> list[object]:
    return [item["type"] for item in items]


# --- журнал -----------------------------------------------------------------------------------


async def test_signing_in_is_logged_with_its_method_and_device(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        response = await login(api, shopper.email, agent=CHROME_MAC)
        token = {"Authorization": f"Bearer {response.json()['access_token']}"}

        items = (await api.client.get(EVENTS, headers=token)).json()

    # Бүртгүүлсэн client-ийн user agent өөр тул Chrome нь энэ бүртгэлд анх удаа харагдаж байна.
    assert types(items) == ["new_device", "login"]
    assert {(item["method"], item["device"]) for item in items} == {("password", "Chrome on macOS")}


async def test_a_wrong_password_is_logged_only_for_an_account_that_exists(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        await login(api, shopper.email, "not the password")
        ghost = await login(api, "nobody@example.com", "not the password")
        good = await login(api, shopper.email)
        token = {"Authorization": f"Bearer {good.json()['access_token']}"}

        items = (await api.client.get(EVENTS, headers=token)).json()

    assert ghost.status_code == 401
    assert types(items) == ["new_device", "login", "login_failed"]


async def test_the_journal_is_private_to_its_owner_and_hides_the_end_of_the_ip(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0) as api:
        mine = await register(api.client)
        other = await register(api.client)
        await login(api, mine.email)
        async with db_engine.begin() as connection:
            await connection.execute(
                text("UPDATE security_events SET ip = '203.0.113.77' WHERE user_id = :u"),
                {"u": mine.user_id},
            )
        good = await login(api, mine.email)
        token = {"Authorization": f"Bearer {good.json()['access_token']}"}

        own = (await api.client.get(EVENTS, headers=token)).json()
        theirs = await events_of(other)
        anonymous = await api.client.get(EVENTS)

    assert {item["ip"] for item in own} >= {"203.0.113.x"}
    assert "203.0.113.77" not in str(own)
    assert theirs == []
    assert anonymous.status_code == 401


async def test_at_most_thirty_events_newest_first(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        async with db_engine.begin() as connection:
            for _ in range(35):
                await connection.execute(
                    text("INSERT INTO security_events (user_id, type) VALUES (:u, 'login')"),
                    {"u": shopper.user_id},
                )
        items = await events_of(shopper)

    assert len(items) == 30
    ids = [int(item["id"]) for item in items]  # type: ignore[call-overload]
    assert ids == sorted(ids, reverse=True)


async def test_changing_the_password_and_revoking_devices_are_logged(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        changed = await api.client.put(
            "/api/v1/auth/password",
            json={"current_password": PASSWORD, "new_password": "a much longer horse battery"},
            headers=shopper.auth,
        )
        token = {"Authorization": f"Bearer {changed.json()['access_token']}"}
        revoked = await api.client.post("/api/v1/auth/sessions/revoke-others", headers=token)
        items = (await api.client.get(EVENTS, headers=token)).json()

    assert (changed.status_code, revoked.status_code) == (200, 204)
    assert types(items) == ["sessions_revoked", "password_changed"]


async def test_a_failed_action_leaves_no_event(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        refused = await api.client.put(
            "/api/v1/auth/password",
            json={"current_password": "wrong password!!", "new_password": "a much longer horse"},
            headers=shopper.auth,
        )

        items = await events_of(shopper)

    assert refused.status_code in (401, 403)
    assert items == []


# --- шинэ төхөөрөмж --------------------------------------------------------------------------


async def test_a_sign_in_from_an_unseen_device_emails_the_owner_and_is_logged(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        shopper = await register(api.client)
        await login(api, shopper.email, agent=CHROME_MAC)  # анхны төхөөрөмж
        mailer.sent.clear()

        async with another_client(api) as phone:
            response = await phone.post(
                "/api/v1/auth/login",
                json={"email": shopper.email, "password": PASSWORD},
                headers={"User-Agent": SAFARI_IPHONE},
            )
            token = {"Authorization": f"Bearer {response.json()['access_token']}"}
            items = (await phone.get(EVENTS, headers=token)).json()

    assert types(items) == ["new_device", "login", "new_device", "login"]
    (notice,) = mailer.sent
    assert notice.to == shopper.email
    assert "Safari on iPhone" in notice.body
    assert notice.subject == "Шинэ төхөөрөмжөөс нэвтэрлээ"


async def test_the_same_device_again_and_the_very_first_session_send_nothing(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        shopper = await register(api.client)  # анхны session: шинэ төхөөрөмж биш
        mailer.sent.clear()

        await login(api, shopper.email, agent=CHROME_MAC)  # register хийсэн UA өөр
        first_login = len(mailer.sent)
        mailer.sent.clear()
        await login(api, shopper.email, agent=CHROME_MAC)

    assert first_login == 1  # register-ийн UA (test client) өөр тул нэг удаа мэдэгдэнэ
    assert mailer.sent == []


async def test_a_phone_only_account_gets_the_event_but_no_email(api_factory: ApiFactory) -> None:
    from tests.support.accounts import install_sms, unique_phone

    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        sms = install_sms(api)
        phone = unique_phone()
        await api.client.post("/api/v1/auth/otp/request", json={"destination": phone})
        await api.client.post(
            "/api/v1/auth/otp/verify",
            json={"destination": phone, "code": sms.last_code()},
            headers={"User-Agent": CHROME_MAC},
        )
        await api.client.post("/api/v1/auth/otp/request", json={"destination": phone})
        verified = await api.client.post(
            "/api/v1/auth/otp/verify",
            json={"destination": phone, "code": sms.last_code()},
            headers={"User-Agent": SAFARI_IPHONE},
        )
        token = {"Authorization": f"Bearer {verified.json()['access_token']}"}
        items = (await api.client.get(EVENTS, headers=token)).json()

    assert "new_device" in types(items)
    assert [item["method"] for item in items if item["type"] == "login"] == ["otp", "otp"]
    assert mailer.sent == []


# --- мэдэгдэл ----------------------------------------------------------------------------------


async def test_changing_or_resetting_the_password_tells_the_owner(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        shopper = await register(api.client)
        mailer.sent.clear()

        await api.client.put(
            "/api/v1/auth/password",
            json={"current_password": PASSWORD, "new_password": "a much longer horse battery"},
            headers=shopper.auth,
        )

    assert [m.subject for m in mailer.sent] == ["Таны нууц үг солигдлоо"]
    assert mailer.sent[0].to == shopper.email


# --- өдрийн хязгаар --------------------------------------------------------------------------


async def test_the_daily_limit_blocks_and_tells_the_owner_once(api_factory: ApiFactory) -> None:
    async with api_factory(
        seed_count=0, rate_limit_login_email="1000/60", rate_limit_login_email_daily="3/86400"
    ) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        shopper = await register(api.client)
        mailer.sent.clear()

        codes = [
            (await login(api, shopper.email, "wrong password!!")).status_code for _ in range(4)
        ]
        right = await login(api, shopper.email)

    assert codes == [401, 401, 401, 429]
    assert right.status_code == 429  # зөв нууц үг ч түгжигдсэн хугацаанд нэвтрэхгүй
    assert right.headers["retry-after"]
    assert [m.subject for m in mailer.sent] == ["Таны бүртгэлд олон удаа буруу нууц үг оруулжээ"]


# --- сул нууц үг -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("password", "reason"),
    [
        ("password123", "common"),
        ("Password1234", "common"),
        ("qwertyuiop", "common"),
        ("1234567890", "common"),
        ("aaaaaaaaaaaa", "repeated"),
        ("ababababab", "repeated"),
    ],
)
def test_common_and_repetitive_passwords_are_weak(password: str, reason: str) -> None:
    assert weakness(password) == reason


@pytest.mark.parametrize(
    "password",
    [
        "correct horse battery",
        "a much longer horse battery",
        "password-horse-battery-staple",
        "Tr0ub4dor&3xyz",
    ],
)
def test_ordinary_strong_passwords_pass(password: str) -> None:
    assert weakness(password) is None


def test_a_password_made_of_the_owners_own_name_or_email_is_weak() -> None:
    assert weakness("ada.lovelace1990", email="ada.lovelace@example.com") == "contains_identity"
    assert weakness("my-name-is-bold-1", full_name="Bold Batbayar") == "contains_identity"
    assert weakness("ab-cd-ef-gh-ij", email="ab@example.com") is None  # богино хэсэг тооцогдохгүй


async def test_registering_with_a_weak_password_is_refused_with_the_reason(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(
            "/api/v1/auth/register",
            json={"email": "weak@example.com", "password": "password123", "full_name": "Weak One"},
        )

    assert response.status_code == 422
    body = response.json()
    assert body["type"] == "urn:angel:problem:weak-password"
    assert body["reason"] == "common"


async def test_changing_to_a_weak_password_is_refused_and_keeps_the_old_one(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        refused = await api.client.put(
            "/api/v1/auth/password",
            json={"current_password": PASSWORD, "new_password": "qwerty12345"},
            headers=shopper.auth,
        )
        still_works = await login(api, shopper.email)

    assert refused.status_code == 422
    assert still_works.status_code == 200


# --- ажилтны session ----------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("role", "expected"), [("admin", 12 * 3600), ("warehouse", 12 * 3600), ("customer", 30 * 86400)]
)
async def test_staff_sessions_do_not_outlive_twelve_idle_hours(
    api_factory: ApiFactory, db_engine: AsyncEngine, role: str, expected: int
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        await set_role(db_engine, shopper.user_id, role)
        response = await login(api, shopper.email)

        async with db_engine.connect() as connection:
            row = (
                await connection.execute(
                    text(
                        "SELECT EXTRACT(EPOCH FROM (expires_at - created_at)) FROM refresh_tokens "
                        "WHERE user_id = :u ORDER BY id DESC LIMIT 1"
                    ),
                    {"u": shopper.user_id},
                )
            ).scalar_one()

    assert response.status_code == 200
    assert abs(float(row) - expected) < 5
    cookie = response.headers["set-cookie"]
    assert f"Max-Age={expected}" in cookie
