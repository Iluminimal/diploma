"""Account, сагс, checkout тестүүдийн туслахууд."""

import hashlib
import hmac
import json
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import WEBHOOK_SECRET, Api

PASSWORD = "correct horse battery"
ADDRESS: dict[str, Any] = {
    "full_name": "Ada Lovelace",
    "line1": "12 Analytical Way",
    "city": "London",
    "postal_code": "N1 9GU",
    "country": "gb",
}


@dataclass
class Shopper:
    client: AsyncClient
    token: str
    user_id: int
    email: str

    @property
    def auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


@asynccontextmanager
async def another_client(
    api: Api, *, refresh_token: str | None = None
) -> AsyncIterator[AsyncClient]:
    """Хоёр дахь browser: ижил апп, өөрийн cookie jar (refresh cookie байж болно)."""
    transport = ASGITransport(app=api.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        if refresh_token:
            client.cookies.set(
                "lk_refresh", refresh_token, domain="test.local", path="/api/v1/auth"
            )
        yield client


def unique_email() -> str:
    return f"shopper-{uuid.uuid4().hex[:8]}@example.com"


async def register(client: AsyncClient, email: str | None = None) -> Shopper:
    email = email or unique_email()
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD, "full_name": "Test Shopper"},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return Shopper(client, body["access_token"], body["user"]["id"], email)


async def add_address(shopper: Shopper, **overrides: Any) -> int:
    response = await shopper.client.post(
        "/api/v1/addresses", json={**ADDRESS, **overrides}, headers=shopper.auth
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


async def add_to_cart(
    client: AsyncClient, product_id: int, *, size: str = "M", quantity: int = 1, token: str = ""
) -> Response:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return await client.post(
        "/api/v1/cart/items",
        json={"product_id": product_id, "size": size, "quantity": quantity},
        headers=headers,
    )


async def checkout(
    shopper: Shopper,
    address_id: int,
    *,
    key: str | None = None,
    method: str = "standard",
) -> Response:
    return await shopper.client.post(
        "/api/v1/checkout",
        json={"address_id": address_id, "shipping_method": method},
        headers={**shopper.auth, "Idempotency-Key": key or uuid.uuid4().hex},
    )


async def stock_of(engine: AsyncEngine, product_id: int) -> int:
    async with engine.connect() as connection:
        value = (
            await connection.execute(
                text("SELECT stock_quantity FROM products WHERE id = :id"), {"id": product_id}
            )
        ).scalar_one()
    return int(value)


async def set_role(engine: AsyncEngine, user_id: int, role: str) -> None:
    """`make create-admin`-ий адил database дээр шууд админ болгох эсвэл болиулах."""
    async with engine.begin() as connection:
        await connection.execute(
            text("UPDATE users SET role = :role WHERE id = :id"), {"role": role, "id": user_id}
        )


async def set_product(engine: AsyncEngine, product_id: int, **columns: Any) -> None:
    assignments = ", ".join(f"{name} = :{name}" for name in columns)
    async with engine.begin() as connection:
        await connection.execute(
            text(f"UPDATE products SET {assignments} WHERE id = :id"),  # noqa: S608 - тестийн нэр
            {**columns, "id": product_id},
        )


def webhook(
    kind: str,
    intent_id: str,
    *,
    amount: int,
    currency: str = "usd",
    event_id: str | None = None,
    secret: str = WEBHOOK_SECRET,
    message: str | None = None,
    event_type: str | None = None,
) -> tuple[bytes, dict[str, str]]:
    """Stripe хэлбэрийн webhook body, хүчинтэй signature header-тэй. `kind` нь succeeded, failed
    эсвэл canceled; `event_type` Stripe event-ийн бүтэн нэрийг дарна.
    """
    stripe_name = {"failed": "payment_failed"}.get(kind, kind)
    intent: dict[str, Any] = {
        "id": intent_id,
        "object": "payment_intent",
        "amount": amount,
        "currency": currency,
    }
    if message:
        intent["last_payment_error"] = {"message": message}
    body = json.dumps(
        {
            "id": event_id or f"evt_{uuid.uuid4().hex}",
            "object": "event",
            "type": event_type or f"payment_intent.{stripe_name}",
            "data": {"object": intent},
        }
    ).encode()
    timestamp = int(time.time())
    signature = hmac.new(
        secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256
    ).hexdigest()
    return body, {
        "Stripe-Signature": f"t={timestamp},v1={signature}",
        "Content-Type": "application/json",
    }


async def send_webhook(client: AsyncClient, kind: str, intent_id: str, **kwargs: Any) -> Response:
    body, headers = webhook(kind, intent_id, **kwargs)
    return await client.post("/api/v1/webhooks/stripe", content=body, headers=headers)
