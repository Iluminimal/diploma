import pytest
from sqlalchemy import text

from angel.core.sms import SmsDeliveryError
from tests.conftest import Api, ApiFactory
from tests.support.accounts import OTP_REQUEST, OTP_VERIFY, install_sms, unique_phone
from tests.support.commerce import PASSWORD, add_to_cart, register, unique_email
from tests.support.fakes import RecordingMailer

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

ME = "/api/v1/auth/me"
OTP_INVALID = "urn:angel:problem:otp-invalid"


async def scalar(api: Api, sql: str, **params: object) -> object:
    async with api.app.state.engine.connect() as connection:
        return (await connection.execute(text(sql), params)).scalar_one_or_none()


async def request_code(api: Api, destination: str) -> int:
    return (await api.client.post(OTP_REQUEST, json={"destination": destination})).status_code


async def verify(api: Api, destination: str, code: str):  # type: ignore[no-untyped-def]
    return await api.client.post(OTP_VERIFY, json={"destination": destination, "code": code})


async def test_a_new_phone_number_signs_up_with_a_code(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)

        assert await request_code(api, "(415) 555-2671") == 202
        assert [m.to for m in sms.sent] == ["+14155552671"]
        assert "Angel" in sms.sent[0].body

        response = await verify(api, "415-555-2671", sms.last_code())

        body = response.json()
        assert response.status_code == 200
        assert body["is_new_user"] is True
        assert body["user"]["phone"] == "+14155552671"
        assert body["user"]["email"] is None
        assert body["user"]["phone_verified"] is True
        assert body["user"]["has_password"] is False
        assert "lk_refresh" in response.headers["set-cookie"]
        me = await api.client.get(ME, headers={"Authorization": f"Bearer {body['access_token']}"})
        assert me.status_code == 200
        assert me.json()["id"] == body["user"]["id"]
        # Кодын зөвхөн hash хадгалагдана.
        stored = await scalar(api, "SELECT code_hash FROM otp_challenges LIMIT 1")
        assert stored != sms.last_code()
        assert len(str(stored)) == 64


async def test_the_same_number_signs_in_to_the_same_account(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        phone = unique_phone()
        await request_code(api, phone)
        first = (await verify(api, phone, sms.last_code())).json()

        again = await api.client.post(OTP_REQUEST, json={"destination": phone.replace("+1", "1 ")})
        assert again.status_code == 202, again.text
        second_response = await verify(api, phone, sms.last_code())
        second = second_response.json()

        assert second_response.status_code == 200, second_response.text
        assert second["is_new_user"] is False
        assert second["user"]["id"] == first["user"]["id"]
        assert await scalar(api, "SELECT count(*) FROM users") == 1


async def test_a_wrong_code_is_rejected_and_a_right_one_works_only_once(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        phone = unique_phone()
        await request_code(api, phone)
        code = sms.last_code()
        wrong = "000000" if code != "000000" else "111111"

        bad = await verify(api, phone, wrong)
        good = await verify(api, phone, code)
        again = await verify(api, phone, code)

        assert (bad.status_code, bad.json()["type"]) == (400, OTP_INVALID)
        assert good.status_code == 200
        assert (again.status_code, again.json()["type"]) == (400, OTP_INVALID)


async def test_too_many_wrong_codes_use_the_code_up(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, otp_max_attempts=3) as api:
        sms = install_sms(api)
        phone = unique_phone()
        await request_code(api, phone)
        code = sms.last_code()
        wrong = "000000" if code != "000000" else "111111"

        statuses = [(await verify(api, phone, wrong)).status_code for _ in range(3)]
        late = await verify(api, phone, code)

        assert statuses == [400, 400, 429]
        assert late.status_code == 400


async def test_an_expired_code_is_rejected(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        phone = unique_phone()
        await request_code(api, phone)
        async with api.app.state.engine.begin() as connection:
            await connection.execute(
                text("UPDATE otp_challenges SET expires_at = now() - interval '1 second'")
            )

        response = await verify(api, phone, sms.last_code())

        assert response.status_code == 400
        assert response.json()["type"] == "urn:angel:problem:otp-expired"


async def test_a_new_code_replaces_the_old_one(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        phone = unique_phone()
        await request_code(api, phone)
        first = sms.last_code()
        await request_code(api, phone)
        second = sms.last_code()

        old = await verify(api, phone, first)
        new = await verify(api, phone, second)

        assert old.status_code == 400  # санамсаргүй ижил код давтагдах нь ховор тохиолдол
        assert new.status_code == 200


async def test_codes_cannot_be_asked_for_again_straight_away(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, otp_resend_seconds=60) as api:
        sms = install_sms(api)
        phone = unique_phone()

        first = await api.client.post(OTP_REQUEST, json={"destination": phone})
        second = await api.client.post(OTP_REQUEST, json={"destination": phone})

        assert first.status_code == 202
        assert second.status_code == 429
        assert 0 < int(second.headers["retry-after"]) <= 60
        assert len(sms.sent) == 1


async def test_a_number_gets_only_a_few_codes_an_hour(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, otp_max_sends_per_hour=2) as api:
        install_sms(api)
        phone = unique_phone()

        statuses = [await request_code(api, phone) for _ in range(3)]

        assert statuses == [202, 202, 429]


async def test_a_code_is_only_good_for_the_number_it_was_sent_to(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        mine, theirs = unique_phone(), unique_phone()
        await request_code(api, mine)
        await request_code(api, theirs)
        theirs_code = sms.last_code()

        response = await verify(api, mine, theirs_code)

        assert response.status_code == 400  # мөн адил: хоёр санамсаргүй код давхцаж болно


@pytest.mark.parametrize("destination", ["abc", "12", "+1 555", "not@", ""])
async def test_something_that_is_not_a_number_or_email_is_a_validation_error(
    api_factory: ApiFactory, destination: str
) -> None:
    async with api_factory(seed_count=0) as api:
        install_sms(api)

        response = await api.client.post(OTP_REQUEST, json={"destination": destination})

        assert response.status_code == 422


async def test_a_code_must_be_six_digits(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await verify(api, unique_phone(), "12ab")

        assert response.status_code == 422


async def test_asking_for_a_code_does_not_reveal_whether_an_account_exists(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        known = unique_phone()
        await request_code(api, known)
        await verify(api, known, sms.last_code())

        known_again = await api.client.post(OTP_REQUEST, json={"destination": known})
        unknown = await api.client.post(OTP_REQUEST, json={"destination": unique_phone()})

        assert known_again.status_code == unknown.status_code == 202
        assert known_again.content == unknown.content


async def test_the_guest_cart_joins_the_account_on_sign_in(api_factory: ApiFactory) -> None:
    async with api_factory() as api:
        sms = install_sms(api)
        product = next(e for e in api.entries if e.in_stock)
        added = await add_to_cart(api.client, product.product_id)
        assert added.status_code == 200, added.text
        phone = unique_phone()
        await request_code(api, phone)

        signed_in = await verify(api, phone, sms.last_code())
        cart = await api.client.get(
            "/api/v1/cart",
            headers={"Authorization": f"Bearer {signed_in.json()['access_token']}"},
        )

        assert [line["product"]["id"] for line in cart.json()["lines"]] == [product.product_id]


async def test_an_email_code_signs_up_and_verifies_the_address(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        install_sms(api)
        email = unique_email()

        assert await request_code(api, f" {email.upper()} ") == 202
        code = mailer.sent[0].body.split("code is ")[1][:6]
        response = await verify(api, email, code)

        body = response.json()
        assert response.status_code == 200
        assert body["is_new_user"] is True
        assert (body["user"]["email"], body["user"]["email_verified"]) == (email, True)
        assert body["user"]["phone"] is None


async def test_an_email_code_for_an_unverified_password_account_removes_the_password(
    api_factory: ApiFactory,
) -> None:
    """Дугаарыг түрүүлж бүртгүүлсэн хүн эзэмшигч болохгүй; кодоор эзэмшигч нь тогтоогдоно."""
    async with api_factory(seed_count=0) as api:
        mailer = RecordingMailer()
        api.app.state.mailer = mailer
        install_sms(api)
        email = unique_email()
        shopper = await register(api.client, email)
        mailer.sent.clear()

        await request_code(api, email)
        code = mailer.sent[0].body.split("code is ")[1][:6]
        response = await verify(api, email, code)

        assert response.json()["user"]["id"] == shopper.user_id
        assert response.json()["user"]["has_password"] is False
        login = await api.client.post(
            "/api/v1/auth/login", json={"email": email, "password": PASSWORD}
        )
        assert login.status_code == 401


async def test_a_disabled_account_cannot_sign_in_with_a_code(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        sms = install_sms(api)
        phone = unique_phone()
        await request_code(api, phone)
        await verify(api, phone, sms.last_code())
        async with api.app.state.engine.begin() as connection:
            await connection.execute(text("UPDATE users SET is_active = false"))
        await request_code(api, phone)

        response = await verify(api, phone, sms.last_code())

        assert response.status_code == 403


async def test_a_failed_text_message_is_reported(api_factory: ApiFactory) -> None:
    class Broken:
        async def send(self, sms: object) -> None:
            raise SmsDeliveryError("down")

    async with api_factory(seed_count=0) as api:
        api.app.state.sms = Broken()

        response = await api.client.post(OTP_REQUEST, json={"destination": unique_phone()})

        assert response.status_code == 503
        assert response.json()["type"] == "urn:angel:problem:sms-unavailable"
