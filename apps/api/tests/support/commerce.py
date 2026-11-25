"""Account, сагс, checkout тестүүдийн туслахууд."""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any

from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from tests.conftest import Api

PASSWORD = "correct horse battery"
ADDRESS: dict[str, Any] = {
    "full_name": "Болд Батбаяр",
    "region": "Улаанбаатар",
    "city": "Баянгол",
    "khoroo": "3-р хороо",
    "line1": "Энхтайваны өргөн чөлөө 12",
    "country": "mn",
    "phone": "99112233",
}
# Орон нутгийн (аймгийн) хаяг: шуурхай хүргэлт болдоггүй бүс.
RURAL_ADDRESS: dict[str, Any] = {
    **ADDRESS,
    "region": "Дархан-Уул",
    "city": "Дархан",
    "khoroo": "5-р баг",
    "line1": "10-р дэнж, 4-р байр",
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


async def qpay_callback(client: AsyncClient, order_number: str, method: str = "GET") -> Response:
    """QPay-ийн мэдэгдлийг дуурайна: гарын үсэггүй, session-гүй, зөвхөн захиалгын дугаартай."""
    return await client.request(method, "/api/v1/webhooks/qpay", params={"order": order_number})
