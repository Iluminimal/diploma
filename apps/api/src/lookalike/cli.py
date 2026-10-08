"""Operational commands. `make create-admin EMAIL=you@example.com` is the way to get the first
administrator: registering through the API always creates a customer."""

import argparse
import asyncio
import getpass
import os

from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from lookalike.core.config import get_settings
from lookalike.db.engine import create_engine
from lookalike.models.user import ROLE_CUSTOMER
from lookalike.schemas.auth import FullName, Password
from lookalike.services.admin_users import provision_admin, set_role

PASSWORD_ENV = "ADMIN_PASSWORD"  # noqa: S105 - the variable's name, not a secret


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="lookalike", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-admin", help="create an administrator or promote an account")
    create.add_argument("--email", required=True)
    create.add_argument("--name", default="Administrator", help="display name for a new account")
    create.add_argument(
        "--keep-password",
        action="store_true",
        help="promote an existing account without asking for a new password",
    )

    revoke = sub.add_parser("revoke-admin", help="turn an administrator back into a customer")
    revoke.add_argument("--email", required=True)
    return parser


def _password(args: argparse.Namespace) -> str | None:
    """From $ADMIN_PASSWORD (scripts, CI), otherwise asked for without echo. Never an argument:
    command lines end up in shell history and process listings."""
    if args.keep_password:
        return None
    value = os.environ.get(PASSWORD_ENV)
    if value is None:
        value = getpass.getpass("Password (10-128 characters): ")
        if value != getpass.getpass("Repeat password: "):
            raise SystemExit("the passwords do not match")
    try:
        return TypeAdapter(Password).validate_python(value)
    except ValidationError as error:
        raise SystemExit(f"invalid password: {error.errors()[0]['msg']}") from None


async def _run(args: argparse.Namespace) -> str:
    password = _password(args) if args.command == "create-admin" else None
    engine = create_engine(get_settings().database_url)
    try:
        sessions = async_sessionmaker[AsyncSession](engine, expire_on_commit=False)
        async with sessions() as session:
            if args.command == "create-admin":
                name = TypeAdapter(FullName).validate_python(args.name)
                try:
                    user, created = await provision_admin(
                        session, email=args.email, password=password, full_name=name
                    )
                except ValueError as error:
                    raise SystemExit(str(error)) from None
                return f"{'created' if created else 'promoted'} administrator {user.email}"
            demoted = await set_role(session, email=args.email, role=ROLE_CUSTOMER)
            if demoted is None:
                raise SystemExit(f"no account for {args.email}")
            return f"{demoted.email} is now a customer"
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    print(asyncio.run(_run(build_parser().parse_args(argv))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
