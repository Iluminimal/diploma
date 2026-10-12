"""Adding, changing, confirming and removing the phone number and email; forgot password."""

import re

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import text

from tests.conftest import Api, ApiFactory
from tests.support.accounts import OTP_REQUEST, OTP_VERIFY, install_sms, unique_phone
from tests.support.commerce import PASSWORD, Shopper, another_client, register, unique_email
from tests.support.fakes import RecordingMailer, RecordingSmsSender

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

PHONE_REQUEST = "/api/v1/auth/phone/request"
PHONE_CONFIRM = "/api/v1/auth/phone/confirm"
PHONE = "/api/v1/auth/phone"
EMAIL_REQUEST = "/api/v1/auth/email/request"
EMAIL_CONFIRM = "/api/v1/auth/email/confirm"
EMAIL = "/api/v1/auth/email"
VERIFY_REQUEST = "/api/v1/auth/email/verify/request"
VERIFY_CONFIRM = "/api/v1/auth/email/verify/confirm"
FORGOT = "/api/v1/auth/password/forgot"
RESET = "/api/v1/auth/password/reset"
LAST_METHOD = "urn:angel:problem:last-sign-in-method"


def code_in(mailer: RecordingMailer) -> str:
    match = re.search(r"code is (\d{6})", mailer.sent[-1].body)
    assert match, mailer.sent[-1].body
    return match.group(1)


async def delete(shopper: Shopper, url: str, **body: object) -> Response:
    return await shopper.client.request("DELETE", url, json=body or None, headers=shopper.auth)


async def phone_account(api: Api, sms: RecordingSmsSender) -> Shopper:
    from tests.support.accounts import sign_in_with_phone

    return await sign_in_with_phone(api, sms)


async def scalar(api: Api, sql: str, **params: object) -> object:
    async with api.app.state.engine.connect() as connection:
        return (await connection.execute(text(sql), params)).scalar_one_or_none()


# --- phone ----------------------------------------------------------------------------------


async def test_an_email_account_adds_a_phone_number_and_can_then_sign_in_with_it(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        shopper = await register(api.client)
        phone = unique_phone()

        wrong_password = await shopper.client.post(
            PHONE_REQUEST,
            json={"phone": phone, "current_password": "not the password"},
            headers=shopper.auth,
        )
        requested = await shopper.client.post(
            PHONE_REQUEST,
            json={"phone": phone, "current_password": PASSWORD},
            headers=shopper.auth,
        )
        confirmed = await shopper.client.post(
            PHONE_CONFIRM, json={"phone": phone, "code": sms.last_code()}, headers=shopper.auth
        )

        assert wrong_password.status_code == 403
        assert requested.status_code == 202
        assert [m.to for m in sms.sent] == [phone]
        body = confirmed.json()
        assert confirmed.status_code == 200, confirmed.text
        assert (body["phone"], body["phone_verified"], body["email"]) == (
            phone,
            True,
            shopper.email,
        )
        async with another_client(api) as other:
            await other.post(OTP_REQUEST, json={"destination": phone})
            signed_in = await other.post(
                OTP_VERIFY, json={"destination": phone, "code": sms.last_code()}
            )
        assert signed_in.json()["user"]["id"] == shopper.user_id
        assert signed_in.json()["is_new_user"] is False


async def test_a_number_that_belongs_to_another_account_is_refused(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        owner = await phone_account(api, sms)
        taken = await scalar(api, "SELECT phone FROM users WHERE id = :id", id=owner.user_id)
        shopper = await register(api.client)

        response = await shopper.client.post(
            PHONE_REQUEST,
            json={"phone": taken, "current_password": PASSWORD},
            headers=shopper.auth,
        )

        assert response.status_code == 409
        assert response.json()["type"] == "urn:angel:problem:phone-taken"
        assert len(sms.sent) == 1  # only the owner's own sign-in code


async def test_changing_the_phone_needs_the_code_sent_to_the_new_number(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        shopper = await phone_account(api, sms)
        old = await scalar(api, "SELECT phone FROM users WHERE id = :id", id=shopper.user_id)
        new = unique_phone()
        await shopper.client.post(PHONE_REQUEST, json={"phone": new}, headers=shopper.auth)
        code = sms.last_code()
        wrong = "000000" if code != "000000" else "111111"

        bad = await shopper.client.post(
            PHONE_CONFIRM, json={"phone": new, "code": wrong}, headers=shopper.auth
        )
        # The code belongs to the new number, not to some other one.
        elsewhere = await shopper.client.post(
            PHONE_CONFIRM, json={"phone": unique_phone(), "code": code}, headers=shopper.auth
        )
        good = await shopper.client.post(
            PHONE_CONFIRM, json={"phone": new, "code": code}, headers=shopper.auth
        )

        assert (bad.status_code, elsewhere.status_code) == (400, 400)
        assert good.json()["phone"] == new != old
        assert (
            await scalar(api, "SELECT phone FROM users WHERE id = :id", id=shopper.user_id) == new
        )


async def test_the_same_number_cannot_be_requested_again(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        shopper = await phone_account(api, sms)
        mine = await scalar(api, "SELECT phone FROM users WHERE id = :id", id=shopper.user_id)

        response = await shopper.client.post(
            PHONE_REQUEST, json={"phone": mine}, headers=shopper.auth
        )

        assert response.status_code == 409


async def test_a_phone_needs_the_session_of_the_person_who_asked(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        asker = await register(api.client)
        phone = unique_phone()
        await asker.client.post(
            PHONE_REQUEST, json={"phone": phone, "current_password": PASSWORD}, headers=asker.auth
        )
        async with another_client(api) as other_client:
            thief = await register(other_client)

            stolen = await thief.client.post(
                PHONE_CONFIRM, json={"phone": phone, "code": sms.last_code()}, headers=thief.auth
            )

        assert stolen.status_code == 400


async def test_the_phone_can_be_removed_only_while_another_way_to_sign_in_remains(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        shopper = await phone_account(api, sms)

        only_phone = await delete(shopper, PHONE)
        email = unique_email()
        await shopper.client.post(EMAIL_REQUEST, json={"email": email}, headers=shopper.auth)
        await shopper.client.post(
            EMAIL_CONFIRM, json={"email": email, "code": code_in(mailer)}, headers=shopper.auth
        )
        removed = await delete(shopper, PHONE)
        only_email = await delete(shopper, EMAIL)

        assert (only_phone.status_code, only_phone.json()["type"]) == (409, LAST_METHOD)
        assert removed.status_code == 200
        assert (removed.json()["phone"], removed.json()["email"]) == (None, email)
        assert (only_email.status_code, only_email.json()["type"]) == (409, LAST_METHOD)


# --- email ----------------------------------------------------------------------------------


async def test_a_phone_account_adds_an_email_that_is_then_verified(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        shopper = await phone_account(api, sms)
        email = unique_email()

        requested = await shopper.client.post(
            EMAIL_REQUEST, json={"email": email.upper()}, headers=shopper.auth
        )
        confirmed = await shopper.client.post(
            EMAIL_CONFIRM, json={"email": email, "code": code_in(mailer)}, headers=shopper.auth
        )

        assert requested.status_code == 202
        assert mailer.sent[0].to == email
        assert (confirmed.json()["email"], confirmed.json()["email_verified"]) == (email, True)


async def test_an_email_used_by_another_account_is_refused(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        install_sms(api)
        other = await register(api.client)
        async with another_client(api) as client:
            shopper = await register(client)

            response = await shopper.client.post(
                EMAIL_REQUEST,
                json={"email": other.email, "current_password": PASSWORD},
                headers=shopper.auth,
            )

        assert response.status_code == 409
        assert response.json()["type"] == "urn:angel:problem:email-taken"


async def test_a_registered_email_is_confirmed_with_a_code(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        shopper = await register(api.client)
        mailer.sent.clear()

        requested = await shopper.client.post(VERIFY_REQUEST, headers=shopper.auth)
        confirmed = await shopper.client.post(
            VERIFY_CONFIRM, json={"code": code_in(mailer)}, headers=shopper.auth
        )
        again = await shopper.client.post(VERIFY_REQUEST, headers=shopper.auth)

        assert requested.status_code == 202
        assert mailer.sent[0].to == shopper.email
        assert confirmed.json()["email_verified"] is True
        assert again.status_code == 202
        assert len(mailer.sent) == 1  # nothing more to send


async def test_removing_the_email_also_drops_the_password_that_needed_it(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        shopper = await register(api.client)
        phone = unique_phone()
        await shopper.client.post(
            PHONE_REQUEST, json={"phone": phone, "current_password": PASSWORD}, headers=shopper.auth
        )
        await shopper.client.post(
            PHONE_CONFIRM, json={"phone": phone, "code": sms.last_code()}, headers=shopper.auth
        )

        wrong = await delete(shopper, EMAIL, current_password="nope nope nope")
        removed = await delete(shopper, EMAIL, current_password=PASSWORD)

        assert wrong.status_code == 403
        body = removed.json()
        assert (body["email"], body["has_password"], body["phone"]) == (None, False, phone)


# --- forgot password ------------------------------------------------------------------------


async def test_a_forgotten_password_is_replaced_with_a_code_and_ends_other_logins(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        install_sms(api)
        shopper = await register(api.client)
        refresh = api.client.cookies.get("lk_refresh")
        mailer.sent.clear()

        asked = await api.client.post(FORGOT, json={"destination": shopper.email})
        reset = await api.client.post(
            RESET,
            json={
                "destination": shopper.email,
                "code": code_in(mailer),
                "new_password": "a brand new passphrase",
            },
        )
        old = await api.client.post(
            "/api/v1/auth/login", json={"email": shopper.email, "password": PASSWORD}
        )
        new = await api.client.post(
            "/api/v1/auth/login",
            json={"email": shopper.email, "password": "a brand new passphrase"},
        )
        async with another_client(api, refresh_token=refresh) as old_browser:
            stale = await old_browser.post("/api/v1/auth/refresh")

        assert asked.status_code == 202
        assert reset.status_code == 200
        assert reset.json()["user"]["id"] == shopper.user_id
        assert old.status_code == 401
        assert new.status_code == 200
        assert stale.status_code == 401


async def test_forgot_password_answers_the_same_for_an_unknown_account(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        sms = install_sms(api)
        shopper = await register(api.client)
        mailer.sent.clear()

        known = await api.client.post(FORGOT, json={"destination": shopper.email})
        unknown = await api.client.post(FORGOT, json={"destination": unique_email()})
        unknown_phone = await api.client.post(FORGOT, json={"destination": unique_phone()})

        assert known.status_code == unknown.status_code == unknown_phone.status_code == 202
        assert known.content == unknown.content == unknown_phone.content
        assert len(mailer.sent) == 1  # only the real account got a message
        assert sms.sent == []


async def test_a_reset_needs_the_right_code(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        install_sms(api)
        shopper = await register(api.client)
        await api.client.post(FORGOT, json={"destination": shopper.email})
        code = code_in(mailer)
        wrong = "000000" if code != "000000" else "111111"

        response = await api.client.post(
            RESET,
            json={"destination": shopper.email, "code": wrong, "new_password": "another long one"},
        )

        assert response.status_code == 400
        still = await api.client.post(
            "/api/v1/auth/login", json={"email": shopper.email, "password": PASSWORD}
        )
        assert still.status_code == 200


async def test_a_reset_code_cannot_be_used_to_sign_in(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        install_sms(api)
        shopper = await register(api.client)
        await api.client.post(FORGOT, json={"destination": shopper.email})

        response = await api.client.post(
            OTP_VERIFY, json={"destination": shopper.email, "code": code_in(mailer)}
        )

        assert response.status_code == 400


async def test_the_new_password_still_has_to_be_long_enough(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(
            RESET, json={"destination": unique_email(), "code": "123456", "new_password": "short"}
        )

        assert response.status_code == 422


async def test_the_contact_endpoints_need_a_signed_in_user(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        client: AsyncClient = api.client
        calls = [
            await client.post(PHONE_REQUEST, json={"phone": "+14155552671"}),
            await client.post(PHONE_CONFIRM, json={"phone": "+14155552671", "code": "123456"}),
            await client.request("DELETE", PHONE),
            await client.post(EMAIL_REQUEST, json={"email": "a@example.com"}),
            await client.post(VERIFY_REQUEST),
        ]

        assert [call.status_code for call in calls] == [401] * 5
