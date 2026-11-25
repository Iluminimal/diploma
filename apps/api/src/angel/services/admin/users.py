import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.security import hash_password
from angel.models import User
from angel.models.user import ROLE_ADMIN, STAFF_ROLES
from angel.repositories.accounts.users import UserRepository


async def provision_staff(
    session: AsyncSession,
    *,
    email: str,
    password: str | None,
    full_name: str,
    role: str = ROLE_ADMIN,
) -> tuple[User, bool]:
    """Ажилтан (админ эсвэл агуулахын ажилтан) үүсгэнэ, эсвэл энэ email-тэй бүртгэл аль хэдийн
    байвал түүнийг `role`-д оноож дэвшүүлнэ.

    Хэрэглэгч болон шинээр үүссэн эсэхийг буцаана. Одоо байгаа бүртгэл нууц үг өгөөгүй бол
    хуучнаа хадгална. Бүртгүүлэх замаар ажилтан хэзээ ч үүсэхгүй: энэ бол цорын ганц зам."""
    if role not in STAFF_ROLES:
        raise ValueError(f"{role!r} is not a staff role")
    email = email.strip().lower()
    password_hash = await asyncio.to_thread(hash_password, password) if password else None
    async with session.begin():
        repository = UserRepository(session)
        user = await repository.get_by_email(email)
        if user is None:
            if password_hash is None:
                raise ValueError(f"no account for {email}: a password is needed to create one")
            user = await repository.create(
                email=email, password_hash=password_hash, full_name=full_name, role=role
            )
            return user, True
        user.role = role
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
