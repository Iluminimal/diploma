import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.core.security import hash_password
from lookalike.models import User
from lookalike.models.user import ROLE_ADMIN
from lookalike.repositories.users import UserRepository


async def provision_admin(
    session: AsyncSession, *, email: str, password: str | None, full_name: str
) -> tuple[User, bool]:
    """Creates an administrator, or promotes the account that already has this email.

    Returns the user and whether it was newly created. An existing account keeps its password
    unless one is given. Registration can never produce an admin: this is the only way in.
    """
    email = email.strip().lower()
    password_hash = await asyncio.to_thread(hash_password, password) if password else None
    async with session.begin():
        repository = UserRepository(session)
        user = await repository.get_by_email(email)
        if user is None:
            if password_hash is None:
                raise ValueError(f"no account for {email}: a password is needed to create one")
            user = await repository.create(
                email=email, password_hash=password_hash, full_name=full_name, role=ROLE_ADMIN
            )
            return user, True
        user.role = ROLE_ADMIN
        user.is_active = True
        if password_hash is not None:
            user.password_hash = password_hash
        return user, False


async def set_role(session: AsyncSession, *, email: str, role: str) -> User | None:
    async with session.begin():
        user = await UserRepository(session).get_by_email(email.strip().lower())
        if user is not None:
            user.role = role
        return user
