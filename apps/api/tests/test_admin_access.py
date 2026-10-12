import pytest
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from angel.cli import PASSWORD_ENV, _run, build_parser
from angel.core.config import get_settings
from angel.core.deps import AdminDep
from angel.core.security import verify_password
from angel.services.admin_users import provision_admin
from tests.commerce import PASSWORD, register, set_role, unique_email
from tests.conftest import ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

PROBE = "/api/v1/_probe/admin"
FORBIDDEN = "urn:angel:problem:forbidden"


def add_probe(app: FastAPI) -> None:
    """The dependency every admin route uses, behind a route that does nothing else."""

    async def probe(admin: AdminDep) -> dict[str, str]:
        return {"email": admin.email}

    app.add_api_route(PROBE, probe, methods=["GET"])


async def test_admin_routes_need_a_signed_in_administrator(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0) as api:
        add_probe(api.app)
        shopper = await register(api.client)

        anonymous = await api.client.get(PROBE)
        customer = await api.client.get(PROBE, headers=shopper.auth)
        await set_role(db_engine, shopper.user_id, "admin")
        admin = await api.client.get(PROBE, headers=shopper.auth)

        assert anonymous.status_code == 401
        assert customer.status_code == 403
        assert customer.headers["content-type"] == "application/problem+json"
        assert customer.json()["type"] == FORBIDDEN
        assert admin.status_code == 200
        assert admin.json() == {"email": shopper.email}


async def test_role_changes_apply_to_a_token_that_is_already_issued(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0) as api:
        add_probe(api.app)
        shopper = await register(api.client)
        await set_role(db_engine, shopper.user_id, "admin")
        assert (await api.client.get(PROBE, headers=shopper.auth)).status_code == 200

        await set_role(db_engine, shopper.user_id, "customer")

        assert (await api.client.get(PROBE, headers=shopper.auth)).status_code == 403


async def test_a_deactivated_administrator_is_signed_out(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0) as api:
        add_probe(api.app)
        shopper = await register(api.client)
        await set_role(db_engine, shopper.user_id, "admin")
        async with db_engine.begin() as connection:
            await connection.execute(
                text("UPDATE users SET is_active = false WHERE id = :id"), {"id": shopper.user_id}
            )

        assert (await api.client.get(PROBE, headers=shopper.auth)).status_code == 401


async def test_the_session_tells_the_client_its_role(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
        await set_role(db_engine, shopper.user_id, "admin")

        me = await api.client.get("/api/v1/auth/me", headers=shopper.auth)

        assert me.json()["role"] == "admin"


async def test_registering_cannot_create_an_administrator(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(
            "/api/v1/auth/register",
            json={
                "email": unique_email(),
                "password": PASSWORD,
                "full_name": "Mallory",
                "role": "admin",
            },
        )

        assert response.status_code == 422


async def test_provision_admin_creates_then_promotes_without_a_new_password(
    db_engine: AsyncEngine,
) -> None:
    sessions = async_sessionmaker[AsyncSession](db_engine, expire_on_commit=False)
    async with sessions() as session:
        created, was_created = await provision_admin(
            session, email=" Boss@Example.com ", password=PASSWORD, full_name="Boss"
        )
    async with sessions() as session:
        again, was_created_again = await provision_admin(
            session, email="boss@example.com", password=None, full_name="Ignored"
        )

    assert was_created
    assert not was_created_again
    assert created.id == again.id
    assert again.email == "boss@example.com"
    assert again.role == "admin"
    assert again.password_hash is not None
    assert verify_password(PASSWORD, again.password_hash)


async def test_provision_admin_promotes_a_customer_and_reactivates_them(
    api_factory: ApiFactory, db_engine: AsyncEngine
) -> None:
    async with api_factory(seed_count=0) as api:
        shopper = await register(api.client)
    async with db_engine.begin() as connection:
        await connection.execute(
            text("UPDATE users SET is_active = false WHERE id = :id"), {"id": shopper.user_id}
        )
    sessions = async_sessionmaker[AsyncSession](db_engine, expire_on_commit=False)

    async with sessions() as session:
        user, created = await provision_admin(
            session, email=shopper.email, password=None, full_name="x"
        )

    assert not created
    assert user.id == shopper.user_id
    assert user.role == "admin"
    assert user.is_active


async def test_provision_admin_needs_a_password_for_a_new_account(db_engine: AsyncEngine) -> None:
    sessions = async_sessionmaker[AsyncSession](db_engine, expire_on_commit=False)
    async with sessions() as session:
        with pytest.raises(ValueError, match="password"):
            await provision_admin(session, email=unique_email(), password=None, full_name="x")


async def test_the_cli_creates_and_revokes_an_administrator(
    monkeypatch: pytest.MonkeyPatch, migrated_database_url: str, db_engine: AsyncEngine
) -> None:
    monkeypatch.setenv("DATABASE_URL", migrated_database_url)
    monkeypatch.setenv(PASSWORD_ENV, PASSWORD)
    get_settings.cache_clear()
    email = unique_email()

    try:
        created = await _run(build_parser().parse_args(["create-admin", "--email", email]))
        revoked = await _run(build_parser().parse_args(["revoke-admin", "--email", email]))
    finally:
        get_settings.cache_clear()

    assert created == f"created administrator {email}"
    assert revoked == f"{email} is now a customer"
    async with db_engine.connect() as connection:
        role = (
            await connection.execute(text("SELECT role FROM users WHERE email = :e"), {"e": email})
        ).scalar_one()
    assert role == "customer"
