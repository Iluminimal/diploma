import logging
import socket
from collections.abc import Iterator
from email import message_from_bytes, policy
from email.message import EmailMessage

import pytest
from aiosmtpd.controller import Controller
from aiosmtpd.smtp import SMTP, Envelope, Session

from angel.core.config import Settings
from angel.core.mail import (
    BestEffortMailer,
    ConsoleMailer,
    Email,
    MailDeliveryError,
    SmtpMailer,
    build_mailer,
)


class Inbox:
    """Тестийн SMTP серверт ирсэн имэйлүүдийг цуглуулна."""

    def __init__(self) -> None:
        self.messages: list[EmailMessage] = []

    async def handle_DATA(self, server: SMTP, session: Session, envelope: Envelope) -> str:
        content = envelope.content
        assert isinstance(content, bytes)
        parsed = message_from_bytes(content, policy=policy.default)
        assert isinstance(parsed, EmailMessage)
        self.messages.append(parsed)
        return "250 OK"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


@pytest.fixture
def smtp_server() -> Iterator[tuple[int, Inbox]]:
    # aiosmtpd нь холболт хаагдахад (teardown) шуугиантай алдаа log-дно.
    logging.getLogger("mail.log").setLevel(logging.CRITICAL)
    inbox = Inbox()
    port = free_port()
    controller = Controller(inbox, hostname="127.0.0.1", port=port)
    controller.start()
    try:
        yield port, inbox
    finally:
        controller.stop()


def mailer_for(port: int) -> SmtpMailer:
    return SmtpMailer(host="127.0.0.1", port=port, sender="Angel <no-reply@angel.local>")


async def test_smtp_mailer_delivers_the_message(smtp_server: tuple[int, Inbox]) -> None:
    port, inbox = smtp_server

    await mailer_for(port).send(
        Email(to="buyer@example.com", subject="Your code", body="Your code is 123456.")
    )

    (message,) = inbox.messages
    assert message["To"] == "buyer@example.com"
    assert message["From"] == "Angel <no-reply@angel.local>"
    assert message["Subject"] == "Your code"
    assert message["Message-ID"]
    assert message["Date"]
    assert message.get_content().strip() == "Your code is 123456."


async def test_smtp_mailer_keeps_mongolian_text(smtp_server: tuple[int, Inbox]) -> None:
    port, inbox = smtp_server

    await mailer_for(port).send(
        Email(to="buyer@example.com", subject="Нэг удаагийн код", body="Таны код: 123456")
    )

    (message,) = inbox.messages
    assert message["Subject"] == "Нэг удаагийн код"
    assert message.get_content().strip() == "Таны код: 123456"


async def test_smtp_mailer_reports_an_unreachable_server() -> None:
    mailer = SmtpMailer(
        host="127.0.0.1", port=free_port(), sender="no-reply@angel.local", timeout_seconds=2
    )

    with pytest.raises(MailDeliveryError):
        await mailer.send(Email(to="buyer@example.com", subject="Hi", body="Hello"))


class Broken:
    async def send(self, email: Email) -> None:
        raise MailDeliveryError("down")


async def test_best_effort_mailer_swallows_delivery_errors() -> None:
    await BestEffortMailer(Broken()).send(Email(to="a@example.com", subject="Hi", body="Hello"))


def test_build_mailer_follows_the_mode() -> None:
    console = Settings(_env_file=None, mail_mode="console")
    smtp = Settings(
        _env_file=None, mail_mode="smtp", smtp_host="localhost", mail_from="no-reply@angel.local"
    )

    assert isinstance(build_mailer(console), ConsoleMailer)
    assert isinstance(build_mailer(smtp), SmtpMailer)


def test_smtp_mode_needs_a_host_and_a_sender() -> None:
    with pytest.raises(ValueError, match="SMTP_HOST and MAIL_FROM"):
        Settings(_env_file=None, mail_mode="smtp", smtp_host="localhost")
