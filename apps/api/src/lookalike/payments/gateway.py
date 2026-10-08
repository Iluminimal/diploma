"""What the shop needs from a payment provider, independent of Stripe.

Services depend on this protocol only. `StripeGateway` talks to Stripe; `OfflineGateway` is an
in-process stand-in for development without keys and for tests.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

PaymentEventKind = Literal["succeeded", "failed", "canceled"]


class PaymentProviderError(Exception):
    """The provider could not be reached or refused the call. Safe to retry."""


class InvalidSignatureError(Exception):
    """A webhook body that is not signed by the provider (or is malformed)."""


@dataclass(frozen=True)
class IntentInfo:
    id: str
    client_secret: str
    status: str


@dataclass(frozen=True)
class PaymentEvent:
    """A provider webhook reduced to what the order logic cares about."""

    id: str
    kind: PaymentEventKind
    intent_id: str
    amount_cents: int
    currency: str
    message: str | None = None


class PaymentGateway(Protocol):
    mode: Literal["stripe", "offline"]

    async def create_intent(
        self, *, amount_cents: int, currency: str, order_number: str, idempotency_key: str
    ) -> IntentInfo:
        """Create (or, for a repeated `idempotency_key`, return) the payment for one order."""
        ...

    async def cancel_intent(self, intent_id: str) -> Literal["canceled", "succeeded"]:
        """Cancel an unpaid intent. "succeeded" means it was paid in the meantime."""
        ...

    async def refund(self, intent_id: str, *, idempotency_key: str) -> str:
        """Refund a paid intent in full; returns the refund id."""
        ...

    def parse_event(self, payload: bytes, signature: str | None) -> PaymentEvent | None:
        """Verify and decode a webhook. None for event types we do not act on."""
        ...
