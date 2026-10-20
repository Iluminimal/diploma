from typing import Any, Literal

import stripe
from stripe import StripeClient

from angel.payments.gateway import (
    IntentInfo,
    InvalidSignatureError,
    PaymentEvent,
    PaymentEventKind,
    PaymentProviderError,
)

_EVENT_KINDS: dict[str, PaymentEventKind] = {
    "payment_intent.succeeded": "succeeded",
    "payment_intent.payment_failed": "failed",
    "payment_intent.canceled": "canceled",
}


def parse_stripe_event(payload: bytes, signature: str | None, secret: str) -> PaymentEvent | None:
    """`Stripe-Signature` header-ийг шалгаж (timestamp + түүхий body дээрх HMAC, 5 минутын зөрүү),
    event-ийг хураана. `secret`-ээр гарын үсэг зураагүй бол InvalidSignatureError шиднэ."""
    if not secret:
        raise PaymentProviderError("webhook secret is not configured")
    if not signature:
        raise InvalidSignatureError("missing signature")
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise InvalidSignatureError("invalid signature") from exc
    kind = _EVENT_KINDS.get(event["type"])
    if kind is None:
        return None
    # StripeObject нь dict биш (v16): attribute бүрээр нь хөндөхийн оронд нэг удаа хөрвүүлнэ.
    intent: dict[str, Any] = event["data"]["object"].to_dict()
    error = intent.get("last_payment_error") or {}
    return PaymentEvent(
        id=event["id"],
        kind=kind,
        intent_id=intent["id"],
        amount_cents=int(intent["amount"]),
        currency=str(intent["currency"]).upper(),
        message=error.get("message"),
    )


class StripeGateway:
    mode: Literal["stripe", "offline"] = "stripe"

    def __init__(self, secret_key: str, webhook_secret: str) -> None:
        self._webhook_secret = webhook_secret
        self._client = StripeClient(secret_key, max_network_retries=2)

    async def create_intent(
        self, *, amount_cents: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        try:
            intent = await self._client.v1.payment_intents.create_async(
                {
                    "amount": amount_cents,
                    "currency": currency.lower(),
                    # Зөвхөн карт, wallet: redirect-тэй аргад буцах хуудас хэрэгтэй болно.
                    "automatic_payment_methods": {"enabled": True, "allow_redirects": "never"},
                    "description": f"Angel order {order_number}",
                    "metadata": {"order_number": order_number},
                },
                {"idempotency_key": idempotency_key},
            )
        except stripe.StripeError as exc:
            raise PaymentProviderError(type(exc).__name__) from exc
        if not intent.client_secret:
            raise PaymentProviderError("no client secret returned")
        return IntentInfo(intent.id, intent.client_secret, intent.status)

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        try:
            await self._client.v1.payment_intents.cancel_async(intent_id)
            return "canceled"
        except stripe.InvalidRequestError:
            # Stripe аль хэдийн төлөгдсөн (эсвэл цуцлагдсан) intent-ийг цуцлахаас татгалздаг.
            try:
                intent = await self._client.v1.payment_intents.retrieve_async(intent_id)
            except stripe.StripeError as exc:
                raise PaymentProviderError(type(exc).__name__) from exc
            if intent.status in ("succeeded", "canceled"):
                return "succeeded" if intent.status == "succeeded" else "canceled"
            raise PaymentProviderError(
                f"cannot cancel an intent in status {intent.status}"
            ) from None
        except stripe.StripeError as exc:
            raise PaymentProviderError(type(exc).__name__) from exc

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        try:
            refund = await self._client.v1.refunds.create_async(
                {"payment_intent": intent_id}, {"idempotency_key": idempotency_key}
            )
        except stripe.StripeError as exc:
            raise PaymentProviderError(type(exc).__name__) from exc
        return refund.id

    def parse_event(self, payload: bytes, signature: str | None) -> PaymentEvent | None:
        return parse_stripe_event(payload, signature, self._webhook_secret)
