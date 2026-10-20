"""Transactional имэйл (interface-ийн ард). Хөгжүүлэлтэд илгээхийн оронд log-д бичнэ."""

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
    """Имэйлийг structured log-д бичнэ. Body-г зөвхөн dev-д бичнэ: захиалгын мэдээлэл агуулж болох
    тул production log-д байж болохгүй."""

    def __init__(self, *, log_body: bool) -> None:
        self._log_body = log_body

    async def send(self, email: Email) -> None:
        log.info(
            "email_sent",
            to=email.to,
            subject=email.subject,
            **({"body": email.body} if self._log_body else {}),
        )
