import secrets
from typing import Literal

from lookalike.payments.gateway import IntentInfo, PaymentEvent
from lookalike.payments.stripe_gateway import parse_stripe_event


class OfflineGateway:
    """Development without Stripe keys (`PAYMENTS_MODE=offline`) and the test double.

    Nothing leaves the process: intents are made up, and the shopper "pays" through the simulate
    endpoint, which feeds the same settlement code a real webhook reaches. Webhooks signed with
    the configured secret are still verified exactly like Stripe's, so they can be replayed
    locally. Never allowed in production (see `Settings`).
    """

    mode: Literal["stripe", "offline"] = "offline"

    def __init__(self, webhook_secret: str = "") -> None:
        self._webhook_secret = webhook_secret

    async def create_intent(
        self, *, amount_cents: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        # Derived from the key so a repeated request gets the same intent, like Stripe's.
        suffix = idempotency_key.replace("-", "")[:24] or secrets.token_hex(12)
        return IntentInfo(
            f"pi_offline_{suffix}", f"pi_offline_{suffix}_secret_offline", "requires_payment"
        )

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        return "canceled"

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        return f"re_offline_{idempotency_key[:24]}"

    def parse_event(self, payload: bytes, signature: str | None) -> PaymentEvent | None:
        return parse_stripe_event(payload, signature, self._webhook_secret)
