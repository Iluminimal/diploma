from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import ADDRESS_LIMIT_TYPE, ADDRESS_NOT_FOUND_TYPE, ProblemError
from angel.models import Address
from angel.repositories.accounts.users import AddressRepository
from angel.schemas.accounts.address import AddressIn, AddressList, AddressOut, AddressUpdate

MAX_ADDRESSES = 10
# Columns that can never be empty, as opposed to the optional ones PATCH may clear with null.
_REQUIRED = {"full_name", "line1", "city", "postal_code", "country"}


def _not_found() -> ProblemError:
    return ProblemError(HTTPStatus.NOT_FOUND, "Address not found", type_=ADDRESS_NOT_FOUND_TYPE)


class AddressService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._addresses = AddressRepository(session)

    async def list(self, user_id: int) -> AddressList:
        async with self._session.begin():
            rows = await self._addresses.list_for_user(user_id)
        return AddressList(items=[AddressOut.model_validate(row) for row in rows])

    async def create(self, user_id: int, data: AddressIn) -> AddressOut:
        async with self._session.begin():
            existing = await self._addresses.count(user_id)
            if existing >= MAX_ADDRESSES:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Address book is full",
                    f"You can save up to {MAX_ADDRESSES} addresses.",
                    type_=ADDRESS_LIMIT_TYPE,
                )
            # The first address is the default; asking for a default replaces the previous one.
            make_default = data.is_default or existing == 0
            if make_default:
                await self._addresses.clear_default(user_id)
            address = Address(user_id=user_id, **{**data.model_dump(), "is_default": make_default})
            await self._addresses.add(address)
            return AddressOut.model_validate(address)

    async def update(self, user_id: int, address_id: int, data: AddressUpdate) -> AddressOut:
        changes = data.model_dump(exclude_unset=True)
        invalid = [key for key in _REQUIRED if key in changes and changes[key] is None]
        if invalid:
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Required address fields cannot be empty",
                ", ".join(sorted(invalid)),
            )
        async with self._session.begin():
            address = await self._addresses.get(user_id, address_id)
            if address is None:
                raise _not_found()
            if changes.get("is_default"):
                await self._addresses.clear_default(user_id)
            for key, value in changes.items():
                if key == "is_default" and value is None:
                    continue
                setattr(address, key, value)
            await self._session.flush()
            return AddressOut.model_validate(address)

    async def delete(self, user_id: int, address_id: int) -> None:
        async with self._session.begin():
            address = await self._addresses.get(user_id, address_id)
            if address is None:
                raise _not_found()
            was_default = address.is_default
            await self._addresses.delete(address)
            if was_default:
                remaining = await self._addresses.list_for_user(user_id)
                if remaining:  # never leave a shopper with addresses but no default
                    remaining[0].is_default = True
