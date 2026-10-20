"""Кодоор нэвтрэх тестүүдийн туслахууд."""

import secrets

from httpx import AsyncClient

from tests.conftest import Api
from tests.support.commerce import Shopper
from tests.support.fakes import RecordingSmsSender

OTP_REQUEST = "/api/v1/auth/otp/request"
OTP_VERIFY = "/api/v1/auth/otp/verify"


def unique_phone() -> str:
    """Энэ ажиллуулалтад өөр хэн ч ашиглаагүй хүчинтэй US дугаар."""
    return f"+1415555{secrets.randbelow(9000) + 1000}"


def install_sms(api: Api) -> RecordingSmsSender:
    sms = RecordingSmsSender()
    api.app.state.sms = sms
    return sms


async def sign_in_with_phone(
    api: Api,
    sms: RecordingSmsSender,
    phone: str | None = None,
    *,
    client: AsyncClient | None = None,
) -> Shopper:
    """`phone`-д код хүсч, илгээсэн текстээс уншаад нэвтэрнэ."""
    phone = phone or unique_phone()
    client = client or api.client
    requested = await client.post(OTP_REQUEST, json={"destination": phone})
    assert requested.status_code == 202, requested.text
    verified = await client.post(OTP_VERIFY, json={"destination": phone, "code": sms.last_code()})
    assert verified.status_code == 200, verified.text
    body = verified.json()
    return Shopper(client, body["access_token"], body["user"]["id"], "")
