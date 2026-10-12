from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, status

from angel.core.deps import AddressServiceDep, CurrentUserDep, no_store
from angel.schemas.accounts.address import AddressIn, AddressList, AddressOut, AddressUpdate
from angel.schemas.problem import ProblemDetail

router = APIRouter(
    prefix="/addresses",
    tags=["addresses"],
    dependencies=[Depends(no_store)],
    responses={401: {"model": ProblemDetail, "description": "Not signed in"}},
)

AddressId = Annotated[int, Path(ge=1, le=2**63 - 1)]
_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "Not one of your addresses"}
}


@router.get("", summary="Saved addresses, default first")
async def list_addresses(user_id: CurrentUserDep, service: AddressServiceDep) -> AddressList:
    return await service.list(user_id)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Save an address")
async def create_address(
    body: AddressIn, user_id: CurrentUserDep, service: AddressServiceDep
) -> AddressOut:
    return await service.create(user_id, body)


@router.patch("/{address_id}", summary="Change an address", responses=_NOT_FOUND)
async def update_address(
    address_id: AddressId, body: AddressUpdate, user_id: CurrentUserDep, service: AddressServiceDep
) -> AddressOut:
    return await service.update(user_id, address_id, body)


@router.delete(
    "/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an address (past orders keep their copy)",
    responses=_NOT_FOUND,
)
async def delete_address(
    address_id: AddressId, user_id: CurrentUserDep, service: AddressServiceDep
) -> None:
    await service.delete(user_id, address_id)
