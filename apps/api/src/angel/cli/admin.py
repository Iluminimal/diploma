"""Үйл ажиллагааны command-ууд. Ажилтныг API-аар бүртгүүлэх боломжгүй (бүртгүүлбэл үргэлж customer
болдог): администраторыг `make create-admin EMAIL=you@example.com`, агуулахын ажилтныг
`make create-warehouse EMAIL=you@example.com`-оор үүсгэнэ."""

import argparse
import asyncio
import getpass
import os

from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from angel.core.config import get_settings
from angel.db.engine import create_engine
from angel.models.user import ROLE_ADMIN, ROLE_CUSTOMER, ROLE_WAREHOUSE
from angel.schemas.accounts.auth import FullName, Password
from angel.services.admin.users import provision_staff, set_role

PASSWORD_ENV = "ADMIN_PASSWORD"  # noqa: S105 - the variable's name, not a secret


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="angel", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-admin", help="create an administrator or promote an account")
    create.add_argument("--email", required=True)
    create.add_argument("--name", default="Administrator", help="display name for a new account")
    create.add_argument(
        "--keep-password",
        action="store_true",
        help="promote an existing account without asking for a new password",
    )

    warehouse = sub.add_parser(
        "create-warehouse", help="create a warehouse worker or promote an account"
    )
    warehouse.add_argument("--email", required=True)
    warehouse.add_argument("--name", default="Warehouse", help="display name for a new account")
    warehouse.add_argument(
        "--keep-password",
        action="store_true",
        help="promote an existing account without asking for a new password",
    )

    for name, who in (
        ("revoke-admin", "an administrator"),
        ("revoke-warehouse", "a warehouse worker"),
    ):
        revoke = sub.add_parser(name, help=f"turn {who} back into a customer")
        revoke.add_argument("--email", required=True)
    return parser


CREATE_ROLES = {"create-admin": ROLE_ADMIN, "create-warehouse": ROLE_WAREHOUSE}
ROLE_LABELS = {ROLE_ADMIN: "administrator", ROLE_WAREHOUSE: "warehouse worker"}


def _password(args: argparse.Namespace) -> str | None:
    """$ADMIN_PASSWORD-оос (script, CI), үгүй бол дэлгэцэнд харуулахгүйгээр асууна. Argument-аар
    хэзээ ч авахгүй: command line нь shell history, process жагсаалтад үлддэг."""
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
    password = _password(args) if args.command in CREATE_ROLES else None
    engine = create_engine(get_settings().database_url)
    try:
        sessions = async_sessionmaker[AsyncSession](engine, expire_on_commit=False)
        async with sessions() as session:
            if args.command in CREATE_ROLES:
                role = CREATE_ROLES[args.command]
                name = TypeAdapter(FullName).validate_python(args.name)
                try:
                    user, created = await provision_staff(
                        session, email=args.email, password=password, full_name=name, role=role
                    )
                except ValueError as error:
                    raise SystemExit(str(error)) from None
                action = "created" if created else "promoted"
                return f"{action} {ROLE_LABELS[role]} {user.identifier}"
            demoted = await set_role(session, email=args.email, role=ROLE_CUSTOMER)
            if demoted is None:
                raise SystemExit(f"no account for {args.email}")
            return f"{demoted.identifier} is now a customer"
    finally:
        await engine.dispose()


def main(argv: list[str] | None = None) -> int:
    print(asyncio.run(_run(build_parser().parse_args(argv))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
