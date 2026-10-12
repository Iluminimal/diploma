"""Transactional email behind an interface. Development logs the message instead of sending it."""

from dataclasses import dataclass
from typing import Protocol

from angel.core.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    body: str


class Mailer(Protocol):
    async def send(self, email: Email) -> None: ...


class ConsoleMailer:
    """Writes the email to the structured log. The body is logged in dev only: it can hold
    order details, which have no place in production logs."""

    def __init__(self, *, log_body: bool) -> None:
        self._log_body = log_body

    async def send(self, email: Email) -> None:
        log.info(
            "email_sent",
            to=email.to,
            subject=email.subject,
            **({"body": email.body} if self._log_body else {}),
        )
