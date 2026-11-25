"""QPayGateway: QPay Merchant API v2-той ярих хэсэг, httpx.MockTransport-оор (сүлжээгүй)."""

import base64
import json
import time
from collections.abc import Callable
from typing import Any

import httpx
import pytest

from angel.payments import PaymentProviderError
from angel.payments.qpay_gateway import QPayGateway

Handler = Callable[[httpx.Request], httpx.Response]


class FakeQPay:
    """QPay-ийн хариуг дуурайж, ирсэн хүсэлт бүрийг бичнэ."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.token_calls = 0
        self.refresh_calls = 0
        self.expires_in: float = time.time() + 3600  # QPay unix timestamp өгдөг
        self.paid_rows: list[dict[str, Any]] = []
        self.routes: dict[tuple[str, str], Handler] = {}
        self.reject_token_once = False
        self.reject_status = 401
        self.reject_always = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path == "/v2/auth/token":
            self.token_calls += 1
            return httpx.Response(200, json=self._token())
        if path == "/v2/auth/refresh":
            self.refresh_calls += 1
            return httpx.Response(200, json=self._token())
        if self.reject_token_once or self.reject_always:
            self.reject_token_once = False
            return httpx.Response(self.reject_status, json={"error": "rejected"})
        route = self.routes.get((request.method, path))
        if route is not None:
            return route(request)
        if (request.method, path) == ("POST", "/v2/invoice"):
            return httpx.Response(
                200,
                json={
                    "invoice_id": "inv-1",
                    "qr_text": "0002010102",
                    "qr_image": "iVBORw0KGgo=",
                    "qPay_shortUrl": "https://s.qpay.mn/abc",
                    "urls": [
                        {
                            "name": "Khan bank",
                            "description": "Хаан банк",
                            "logo": "l",
                            "link": "k://",
                        },
                        {"name": "broken"},
                    ],
                },
            )
        if (request.method, path) == ("POST", "/v2/payment/check"):
            return httpx.Response(
                200,
                json={"count": len(self.paid_rows), "paid_amount": 0, "rows": self.paid_rows},
            )
        if request.method == "DELETE":
            return httpx.Response(200, json={})
        return httpx.Response(404)

    def _token(self) -> dict[str, Any]:
        n = self.token_calls + self.refresh_calls
        return {
            "access_token": f"access-{n}",
            "refresh_token": f"refresh-{n}",
            "expires_in": self.expires_in,
            "refresh_expires_in": time.time() + 86400,
        }


@pytest.fixture
def qpay() -> FakeQPay:
    return FakeQPay()


@pytest.fixture
async def gateway(qpay: FakeQPay) -> Any:
    gw = QPayGateway(
        base_url="https://merchant-sandbox.qpay.mn",
        client_id="TEST_MERCHANT",
        client_secret="123456",
        invoice_code="TEST_INVOICE",
        callback_base_url="https://shop.example",
        transport=httpx.MockTransport(qpay.handler),
    )
    yield gw
    await gw.aclose()


def body(request: httpx.Request) -> dict[str, Any]:
    data: dict[str, Any] = json.loads(request.content)
    return data


async def test_an_invoice_is_created_in_whole_tugrik_with_our_callback(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    intent = await gateway.create_intent(
        amount=12_538_300, currency="MNT", order_number="LK-ABCDEFGH", idempotency_key="order-1"
    )

    token, invoice = qpay.requests
    expected = base64.b64encode(b"TEST_MERCHANT:123456").decode()
    assert token.headers["Authorization"] == f"Basic {expected}"
    assert invoice.headers["Authorization"] == "Bearer access-1"
    assert body(invoice) == {
        "invoice_code": "TEST_INVOICE",
        "sender_invoice_no": "LK-ABCDEFGH",
        "invoice_receiver_code": "terminal",
        "invoice_description": "Angel LK-ABCDEFGH",
        "amount": 125_383,
        "callback_url": "https://shop.example/api/v1/webhooks/qpay?order=LK-ABCDEFGH",
    }
    assert intent.id == "inv-1"
    assert intent.checkout["qr_image"] == "iVBORw0KGgo="
    assert intent.checkout["short_url"] == "https://s.qpay.mn/abc"
    # Холбоосгүй банкийг алгасна.
    assert [b["name"] for b in intent.checkout["banks"]] == ["Khan bank"]


async def test_only_tugrik_can_be_charged(gateway: QPayGateway) -> None:
    with pytest.raises(PaymentProviderError, match="MNT only"):
        await gateway.create_intent(
            amount=3499, currency="USD", order_number="LK-1", idempotency_key="k"
        )


async def test_the_token_is_reused_until_it_expires_then_refreshed(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    await gateway.check("inv-1")
    await gateway.check("inv-1")
    assert (qpay.token_calls, qpay.refresh_calls) == (1, 0)

    qpay.expires_in = time.time() + 3600
    gateway._access_until = time.time() - 1  # token дууссан
    await gateway.check("inv-1")

    assert (qpay.token_calls, qpay.refresh_calls) == (1, 1)
    assert qpay.requests[-1].headers["Authorization"] == "Bearer access-2"


async def test_relative_expiry_seconds_are_understood_too(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    qpay.expires_in = 30  # маржинаас богино: дараагийн дуудлага шинэ token авна
    await gateway.check("inv-1")
    await gateway.check("inv-1")

    assert qpay.token_calls + qpay.refresh_calls == 2


async def test_a_rejected_token_is_replaced_and_the_call_retried_once(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    await gateway.check("inv-1")
    qpay.reject_token_once = True

    assert await gateway.check("inv-1") is None
    assert qpay.token_calls + qpay.refresh_calls == 2


@pytest.mark.parametrize("status", [401, 403])
async def test_a_token_qpay_rejects_with_401_or_403_is_replaced_from_the_credentials(
    gateway: QPayGateway, qpay: FakeQPay, status: int
) -> None:
    await gateway.check("inv-1")
    qpay.reject_token_once = True
    qpay.reject_status = status
    tokens_before = qpay.token_calls

    assert await gateway.check("inv-1") is None

    # QPay-ийн зөвлөмж: хуучин token-оо хаяж /auth/token-оос шинээр ав (refresh биш).
    assert qpay.token_calls == tokens_before + 1
    assert (
        qpay.requests[-1].headers["authorization"]
        == f"Bearer access-{qpay.token_calls + qpay.refresh_calls}"
    )


async def test_a_second_rejection_is_reported_instead_of_retrying_forever(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    qpay.reject_always = True
    qpay.reject_status = 403

    with pytest.raises(PaymentProviderError):
        await gateway.check("inv-1")

    invoice_calls = [r for r in qpay.requests if r.url.path == "/v2/payment/check"]
    assert len(invoice_calls) == 2  # нэг удаа л давтсан


async def test_check_reports_a_paid_invoice_in_minor_units(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    assert await gateway.check("inv-1") is None
    qpay.paid_rows = [
        {"payment_id": 1, "payment_status": "NEW", "payment_amount": "1"},
        {
            "payment_id": 77,
            "payment_status": "PAID",
            "payment_amount": "125383.00",
            "payment_currency": "MNT",
        },
    ]

    event = await gateway.check("inv-1")

    assert event is not None
    assert (event.id, event.intent_id, event.amount, event.currency) == (
        "qpay_77",
        "inv-1",
        12_538_300,
        "MNT",
    )
    check = next(r for r in qpay.requests if r.url.path == "/v2/payment/check")
    assert body(check) == {
        "object_type": "INVOICE",
        "object_id": "inv-1",
        "offset": {"page_number": 1, "page_limit": 100},
    }


async def test_cancelling_a_paid_invoice_reports_success_instead(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    qpay.paid_rows = [{"payment_id": 5, "payment_status": "PAID", "payment_amount": 100}]

    assert await gateway.cancel_intent("inv-1") == "succeeded"
    assert not any(r.method == "DELETE" for r in qpay.requests)


async def test_cancelling_an_unpaid_invoice_deletes_it_even_if_it_is_already_gone(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    assert await gateway.cancel_intent("inv-1") == "canceled"
    qpay.routes[("DELETE", "/v2/invoice/inv-2")] = lambda _: httpx.Response(404)
    assert await gateway.cancel_intent("inv-2") == "canceled"

    deletes = [r.url.path for r in qpay.requests if r.method == "DELETE"]
    assert deletes == ["/v2/invoice/inv-1", "/v2/invoice/inv-2"]


async def test_a_refund_falls_back_to_cancelling_a_non_card_payment(
    gateway: QPayGateway, qpay: FakeQPay
) -> None:
    qpay.paid_rows = [{"payment_id": 9, "payment_status": "PAID", "payment_amount": 100}]
    qpay.routes[("DELETE", "/v2/payment/refund/9")] = lambda _: httpx.Response(400)

    refund_id = await gateway.refund("inv-1", idempotency_key="refund-inv-1")

    deletes = [r.url.path for r in qpay.requests if r.method == "DELETE"]
    assert deletes == ["/v2/payment/refund/9", "/v2/payment/cancel/9"]
    assert refund_id == "qpay_refund_9"


async def test_nothing_to_refund_is_an_error(gateway: QPayGateway) -> None:
    with pytest.raises(PaymentProviderError, match="No QPay payment"):
        await gateway.refund("inv-1", idempotency_key="k")


@pytest.mark.parametrize(
    "response",
    [httpx.Response(500), httpx.Response(200, content=b"not json")],
)
async def test_server_errors_become_provider_errors(
    gateway: QPayGateway, qpay: FakeQPay, response: httpx.Response
) -> None:
    qpay.routes[("POST", "/v2/payment/check")] = lambda _: response

    with pytest.raises(PaymentProviderError):
        await gateway.check("inv-1")


async def test_an_unreachable_qpay_is_a_provider_error() -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    gateway = QPayGateway(
        base_url="https://merchant-sandbox.qpay.mn",
        client_id="a",
        client_secret="b",
        invoice_code="c",
        callback_base_url="https://shop.example",
        transport=httpx.MockTransport(down),
    )
    with pytest.raises(PaymentProviderError, match="unreachable"):
        await gateway.check("inv-1")
    await gateway.aclose()
