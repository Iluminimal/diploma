"""Transactional имэйл (interface-ийн ард). Хөгжүүлэлтэд log-д бичиж эсвэл SMTP (Mailpit) руу
илгээнэ, production-д жинхэнэ SMTP үйлчилгээ үзүүлэгч рүү өгнө."""

from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Protocol

import aiosmtplib

from angel.core.config import Settings
from angel.core.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    body: str


class MailDeliveryError(Exception):
    """SMTP сервер имэйлийг хүлээн авсангүй (хэрэглэгч дахин оролдох ёстой)."""


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


class SmtpMailer:
    """SMTP-ээр жинхэнэ имэйл илгээнэ. Dev-д Mailpit (`make infra`), production-д дурын SMTP.

    Нэвтрэх нэр заагаагүй бол auth хийхгүй (Mailpit-д хэрэггүй). `starttls` үед холболтыг
    шифрлэнэ. Алдааг `MailDeliveryError` болгон шилжүүлнэ: дуудагч нь тухайн урсгалд тохируулан
    шийднэ (нэг удаагийн код -> 503, мэдэгдэл -> log)."""

    def __init__(
        self,
        *,
        host: str,
        port: int,
        sender: str,
        username: str = "",
        password: str = "",
        starttls: bool = False,
        timeout_seconds: float = 10,
    ) -> None:
        self._host = host
        self._port = port
        self._sender = sender
        self._username = username or None
        self._password = password or None
        self._starttls = starttls
        self._timeout = timeout_seconds

    async def send(self, email: Email) -> None:
        message = EmailMessage()
        message["From"] = self._sender
        message["To"] = email.to
        message["Subject"] = email.subject
        message["Date"] = formatdate(localtime=False)
        message["Message-ID"] = make_msgid(domain=self._sender.rpartition("@")[2] or None)
        message.set_content(email.body)  # UTF-8 (монгол үсэг дэмжинэ)
        try:
            await aiosmtplib.send(
                message,
                hostname=self._host,
                port=self._port,
                username=self._username,
                password=self._password,
                start_tls=self._starttls,
                timeout=self._timeout,
            )
        except (aiosmtplib.SMTPException, OSError, TimeoutError) as exc:
            log.warning("email_failed", subject=email.subject, error=type(exc).__name__)
            raise MailDeliveryError(type(exc).__name__) from exc
        log.info("email_sent", subject=email.subject)


class BestEffortMailer:
    """Мэдэгдлийн имэйлд (тавтай морил, захиалгын төлөв): DB-д commit хийсний дараа явуулдаг тул
    SMTP унасан үед хүсэлтийг 500 болгож хэрэглэгчийг төөрөлдүүлэхгүй, зөвхөн log-д бичнэ."""

    def __init__(self, inner: Mailer) -> None:
        self._inner = inner

    async def send(self, email: Email) -> None:
        try:
            await self._inner.send(email)
        except MailDeliveryError:
            log.warning("email_dropped", subject=email.subject)


def build_mailer(settings: Settings) -> Mailer:
    if settings.mail_mode == "smtp":
        return SmtpMailer(
            host=settings.smtp_host,
            port=settings.smtp_port,
            sender=settings.mail_from,
            username=settings.smtp_username,
            password=settings.smtp_password,
            starttls=settings.smtp_starttls,
        )
    return ConsoleMailer(log_body=settings.app_env != "prod")
