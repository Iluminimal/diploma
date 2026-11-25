"""QPay-ийн credential, холболтыг жинхэнэ сүлжээгээр шалгана (sandbox эсвэл өөрийн merchant).

Алхмууд: token авах -> 100 ₮-ийн туршилтын нэхэмжлэх үүсгэх (QR, банкны холбоос, short url ирж буйг
шалгана) -> төлөгдөөгүй гэдгийг `payment/check`-ээр батлах -> нэхэмжлэхийг цуцлах. Төлбөр огт
хийгдэхгүй, нэхэмжлэх нь шууд хаагдана. `PAYMENTS_MODE`-оос үл хамааран `QPAY_*` тохиргоог
уншина, тиймээс `offline` горимд байхдаа ч credential-ээ шалгаж болно. Secret-ийг хэзээ ч
хэвлэхгүй.

cd apps/api && uv run python ../../scripts/qpay_smoke.py
make qpay-check
"""

import asyncio
import sys
import time

from angel.core.config import get_settings
from angel.payments import PaymentProviderError
from angel.payments.qpay_gateway import QPayGateway

TEST_AMOUNT_MINOR = 100 * 100  # 100 ₮ (төгрөг x 100)


def mask(value: str) -> str:
    return value[:2] + "…" + value[-2:] if len(value) > 6 else "…"


async def run() -> int:
    settings = get_settings()
    if settings.app_env == "prod":
        print("refusing to run with APP_ENV=prod: this creates a real (unpaid, cancelled) invoice")
        return 2
    missing = [
        name
        for name, value in (
            ("QPAY_CLIENT_ID", settings.qpay_client_id),
            ("QPAY_CLIENT_SECRET", settings.qpay_client_secret),
            ("QPAY_INVOICE_CODE", settings.qpay_invoice_code),
        )
        if not value
    ]
    if missing:
        print(f"missing in .env: {', '.join(missing)}")
        print("sandbox test values: TEST_MERCHANT / 123456 / TEST_INVOICE (see .env.example)")
        return 2

    print(f"QPay base url : {settings.qpay_base_url}")
    print(f"client id     : {mask(settings.qpay_client_id)}")
    print(f"invoice code  : {settings.qpay_invoice_code}")
    print(
        f"callback      : {settings.qpay_callback_base_url}{settings.api_v1_prefix}/webhooks/qpay"
    )
    if (
        "localhost" in settings.qpay_callback_base_url
        or "127.0.0.1" in settings.qpay_callback_base_url
    ):
        print("  note: QPay cannot reach localhost; use a tunnel (cloudflared/ngrok) for automatic")
        print("        confirmation, or customers confirm with the 'check payment' button.")

    gateway = QPayGateway(
        base_url=settings.qpay_base_url,
        client_id=settings.qpay_client_id,
        client_secret=settings.qpay_client_secret,
        invoice_code=settings.qpay_invoice_code,
        callback_base_url=settings.qpay_callback_base_url,
        api_prefix=settings.api_v1_prefix,
    )
    problems: list[str] = []
    try:
        number = f"SMOKE-{int(time.time())}"
        intent = await gateway.create_intent(
            amount=TEST_AMOUNT_MINOR,
            currency="MNT",
            order_number=number,
            idempotency_key=f"smoke-{number}",
        )
        checkout = intent.checkout or {}
        banks = checkout.get("banks") or []
        print(f"\n[ok] token + invoice created: {intent.id}")
        for field in ("qr_image", "qr_text", "short_url"):
            present = bool(checkout.get(field))
            print(f"[{'ok' if present else '!!'}] {field}: {'present' if present else 'MISSING'}")
            if not present:
                problems.append(f"invoice response has no {field}")
        print(f"[{'ok' if banks else '!!'}] bank deep links: {len(banks)}")
        if not banks:
            problems.append("invoice response has no bank links (urls)")
        paid = await gateway.check(intent.id)
        print(f"[{'ok' if paid is None else '!!'}] payment/check on an unpaid invoice: {paid}")
        if paid is not None:
            problems.append("an unpaid invoice reports a payment")
        outcome = await gateway.cancel_intent(intent.id)
        print(f"[{'ok' if outcome == 'canceled' else '!!'}] invoice cancelled: {outcome}")
        if outcome != "canceled":
            problems.append(f"cancel answered {outcome}")
    except PaymentProviderError as error:
        print(f"\n[!!] QPay call failed: {error}")
        print("     401/403: check QPAY_CLIENT_ID, QPAY_CLIENT_SECRET, QPAY_INVOICE_CODE, base url")
        return 1
    finally:
        await gateway.aclose()

    if problems:
        print("\nproblems:\n  - " + "\n  - ".join(problems))
        return 1
    print("\nall good: set PAYMENTS_MODE=qpay and restart `make api`.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
