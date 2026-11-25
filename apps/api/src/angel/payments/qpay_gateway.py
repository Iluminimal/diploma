"""QPay Merchant API v2 (https://developer.qpay.mn): нэхэмжлэх үүсгэж QR кодоор төлбөр авна.

Урсгал: token авна → захиалга бүрд нэхэмжлэх (QR зураг, банкны апп-ын холбоос) → худалдан авагч
банкны апп-аараа төлнө → QPay `callback_url` руу мэдэгдэнэ → бид `payment/check`-ээр баталгаажуулна.
Callback-д гарын үсэг байдаггүй тул түүнд хэзээ ч итгэхгүй, зөвхөн шалгах дохио болгоно.

QPay зөвхөн төгрөгөөр (MNT) мөнгө авна. Дүнг минор нэгжээр (төгрөг x 100) хүлээн авч, бүхэл
төгрөгөөр илгээнэ.
"""

import asyncio
import base64
import time
from typing import Any, Literal

import httpx

from angel.core.logging import get_logger
from angel.payments.gateway import IntentInfo, PaymentEvent, PaymentMode, PaymentProviderError

log = get_logger(__name__)

# Token дуусахаас өмнө ийм зайтайгаар шинэчилнэ: замд байх хүсэлт хуучин token-оор очихгүй.
_TOKEN_MARGIN_SECONDS = 60
# QPay token-ийг ийм хариугаар татгалздаг (баримт: 401 эсвэл 403 бол token-оо хаяад нэг удаа давт).
_TOKEN_REJECTED = {401, 403}
# `expires_in`-ийг QPay заримдаа үлдсэн секундээр биш unix timestamp-аар өгдөг.
_EPOCH_THRESHOLD = 1_000_000_000


class QPayGateway:
    mode: PaymentMode = "qpay"
    charge_currency: str | None = "MNT"

    def __init__(
        self,
        *,
        base_url: str,
        client_id: str,
        client_secret: str,
        invoice_code: str,
        callback_base_url: str,
        api_prefix: str = "/api/v1",
        invoice_receiver_code: str = "terminal",
        timeout_seconds: float = 10.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"), timeout=timeout_seconds, transport=transport
        )
        self._basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
        self._invoice_code = invoice_code
        self._receiver_code = invoice_receiver_code
        self._callback = f"{callback_base_url.rstrip('/')}{api_prefix}/webhooks/qpay"
        self._lock = asyncio.Lock()
        self._access: str | None = None
        self._access_until = 0.0
        self._refresh: str | None = None
        self._refresh_until = 0.0

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- төлбөрийн үйлдлүүд ---

    async def create_intent(
        self, *, amount: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        if currency != "MNT":
            raise PaymentProviderError(f"QPay charges in MNT only, not {currency}")
        tugrik = amount // 100
        body = {
            "invoice_code": self._invoice_code,
            # Нэхэмжлэх бүрд давтагдашгүй байх ёстой: захиалга бүрд нэг нэхэмжлэх.
            "sender_invoice_no": order_number,
            "invoice_receiver_code": self._receiver_code,
            "invoice_description": f"Angel {order_number}",
            "amount": tugrik,
            "callback_url": f"{self._callback}?order={order_number}",
        }
        data = await self._request("POST", "/v2/invoice", json=body)
        invoice_id = data.get("invoice_id")
        if not isinstance(invoice_id, str) or not invoice_id:
            raise PaymentProviderError("QPay returned no invoice_id")
        banks = [
            {
                "name": str(url.get("name") or ""),
                "description": str(url.get("description") or ""),
                "logo": str(url.get("logo") or ""),
                "link": str(url.get("link") or ""),
            }
            for url in data.get("urls") or []
            if isinstance(url, dict) and url.get("link")
        ]
        checkout = {
            "qr_image": str(data.get("qr_image") or ""),
            "qr_text": str(data.get("qr_text") or ""),
            "short_url": str(data.get("qPay_shortUrl") or ""),
            "banks": banks,
        }
        log.info("qpay_invoice_created", order=order_number, invoice_id=invoice_id, tugrik=tugrik)
        return IntentInfo(invoice_id, "requires_payment", checkout)

    async def check(self, intent_id: str) -> PaymentEvent | None:
        data = await self._request(
            "POST",
            "/v2/payment/check",
            json={
                "object_type": "INVOICE",
                "object_id": intent_id,
                "offset": {"page_number": 1, "page_limit": 100},
            },
        )
        for row in data.get("rows") or []:
            if not isinstance(row, dict) or row.get("payment_status") != "PAID":
                continue
            payment_id = row.get("payment_id")
            if payment_id is None:
                continue
            try:
                paid = round(float(row.get("payment_amount") or 0) * 100)
            except (TypeError, ValueError) as exc:
                raise PaymentProviderError("QPay returned an unreadable amount") from exc
            return PaymentEvent(
                id=f"qpay_{payment_id}",
                intent_id=intent_id,
                amount=paid,
                currency=str(row.get("payment_currency") or "MNT").upper(),
            )
        return None

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        if await self.check(intent_id) is not None:
            return "succeeded"
        try:
            await self._request("DELETE", f"/v2/invoice/{intent_id}")
        except _ClientError as exc:
            # Аль хэдийн цуцлагдсан эсвэл олдохгүй нэхэмжлэх: төлөгдөх боломжгүй тул цуцлагдсан.
            log.info("qpay_invoice_already_closed", invoice_id=intent_id, status=exc.status)
        return "canceled"

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        event = await self.check(intent_id)
        if event is None:
            raise PaymentProviderError("No QPay payment to refund")
        payment_id = event.id.removeprefix("qpay_")
        note = {"note": f"Angel refund {idempotency_key}"[:1000]}
        try:
            # Картын гүйлгээ буцаалтаар, бусад нь (банкны апп) цуцлалтаар буцна.
            await self._request("DELETE", f"/v2/payment/refund/{payment_id}", json=note)
        except _ClientError:
            await self._request("DELETE", f"/v2/payment/cancel/{payment_id}", json=note)
        return f"qpay_refund_{payment_id}"

    # --- HTTP ба token ---

    async def _request(
        self, method: str, path: str, *, json: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        for attempt in (1, 2):
            token = await self._token()
            try:
                response = await self._client.request(
                    method, path, json=json, headers={"Authorization": f"Bearer {token}"}
                )
            except httpx.HTTPError as exc:
                raise PaymentProviderError(f"QPay unreachable: {type(exc).__name__}") from exc
            if response.status_code in _TOKEN_REJECTED and attempt == 1:
                # Token хүчингүй (401) эсвэл эрх хүрэхгүй (403): QPay-ийн зөвлөмжөөр хаяж, шинээр
                # аваад нэг удаа давтана. Давтсан ч татгалзвал credential, эрхийг шалгах хэрэгтэй.
                self._access = None
                self._refresh = None
                continue
            return _json(response, path)
        raise PaymentProviderError("QPay rejected the access token")

    async def _token(self) -> str:
        async with self._lock:
            now = time.time()
            if self._access and now < self._access_until - _TOKEN_MARGIN_SECONDS:
                return self._access
            data: dict[str, Any] | None = None
            if self._refresh and now < self._refresh_until - _TOKEN_MARGIN_SECONDS:
                try:
                    data = await self._auth("/v2/auth/refresh", f"Bearer {self._refresh}")
                except PaymentProviderError:
                    data = None  # refresh дууссан бол client credential-аар шинээр авна
            if data is None:
                data = await self._auth("/v2/auth/token", f"Basic {self._basic}")
            access = data.get("access_token")
            if not isinstance(access, str) or not access:
                raise PaymentProviderError("QPay returned no access_token")
            self._access = access
            self._access_until = _deadline(data.get("expires_in"), now, default=3600)
            refresh = data.get("refresh_token")
            self._refresh = refresh if isinstance(refresh, str) and refresh else None
            self._refresh_until = _deadline(data.get("refresh_expires_in"), now, default=0)
            return access

    async def _auth(self, path: str, authorization: str) -> dict[str, Any]:
        try:
            response = await self._client.post(path, headers={"Authorization": authorization})
        except httpx.HTTPError as exc:
            raise PaymentProviderError(f"QPay unreachable: {type(exc).__name__}") from exc
        return _json(response, path)


class _ClientError(PaymentProviderError):
    """QPay хүсэлтийг 4xx-ээр татгалзсан (жишээ нь аль хэдийн цуцлагдсан нэхэмжлэх)."""

    def __init__(self, path: str, status: int) -> None:
        super().__init__(f"QPay {path} answered {status}")
        self.status = status


def _json(response: httpx.Response, path: str) -> dict[str, Any]:
    if 400 <= response.status_code < 500:
        raise _ClientError(path, response.status_code)
    if response.status_code >= 500:
        raise PaymentProviderError(f"QPay {path} answered {response.status_code}")
    if not response.content:
        return {}
    try:
        data = response.json()
    except ValueError as exc:
        raise PaymentProviderError(f"QPay {path} returned invalid JSON") from exc
    return data if isinstance(data, dict) else {}


def _deadline(value: object, now: float, *, default: int) -> float:
    """`expires_in`-ийг үнэмлэхүй хугацаа болгоно: unix timestamp эсвэл үлдсэн секунд аль аль нь."""
    if isinstance(value, int | float) and value > 0:
        return float(value) if value > _EPOCH_THRESHOLD else now + float(value)
    return now + default
