"""Text messages behind an interface, like `Mailer`: development logs the message (so the one-time
code can be read from the API log), production hands it to Twilio."""

from dataclasses import dataclass
from typing import Protocol

import httpx

from angel.core.config import Settings
from angel.core.logging import get_logger
from angel.core.phone import mask_phone

log = get_logger(__name__)

_TWILIO_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


@dataclass(frozen=True)
class Sms:
    to: str  # E.164
    body: str


class SmsDeliveryError(Exception):
    """The provider did not accept the message (the person should try again)."""


class SmsSender(Protocol):
    async def send(self, sms: Sms) -> None: ...


class ConsoleSmsSender:
    """Writes the message to the structured log. The body (which holds a one-time code) and the
    full number are logged in dev only."""

    def __init__(self, *, log_body: bool) -> None:
        self._log_body = log_body

    async def send(self, sms: Sms) -> None:
        if self._log_body:
            log.info("sms_sent", to=sms.to, body=sms.body)
        else:
            log.info("sms_sent", to=mask_phone(sms.to))


class TwilioSmsSender:
    def __init__(
        self, *, account_sid: str, auth_token: str, from_number: str, timeout_seconds: float = 10
    ) -> None:
        self._sid = account_sid
        self._auth = (account_sid, auth_token)
        self._from = from_number
        self._timeout = timeout_seconds

    async def send(self, sms: Sms) -> None:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    _TWILIO_URL.format(sid=self._sid),
                    auth=self._auth,
                    data={"To": sms.to, "From": self._from, "Body": sms.body},
                )
        except httpx.HTTPError as exc:
            log.warning("sms_failed", to=mask_phone(sms.to), error=type(exc).__name__)
            raise SmsDeliveryError(type(exc).__name__) from exc
        if response.status_code >= 400:
            log.warning("sms_failed", to=mask_phone(sms.to), status=response.status_code)
            raise SmsDeliveryError(f"HTTP {response.status_code}")
        log.info("sms_sent", to=mask_phone(sms.to))


def build_sms_sender(settings: Settings) -> SmsSender:
    if settings.sms_mode == "twilio":
        return TwilioSmsSender(
            account_sid=settings.twilio_account_sid,
            auth_token=settings.twilio_auth_token,
            from_number=settings.twilio_from_number,
        )
    return ConsoleSmsSender(log_body=settings.app_env != "prod")
