from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path

from angel.core.csrf import require_same_origin
from angel.core.deps import CartOwnerDep, CartServiceDep, CartWriterDep, no_store
from angel.schemas.cart import CartItemIn, CartItemUpdate, CartOut
from angel.schemas.problem import ProblemDetail

# The guest cart is addressed by a cookie, so changes are origin-checked (see core/csrf.py).
router = APIRouter(
    prefix="/cart",
    tags=["cart"],
    dependencies=[Depends(require_same_origin), Depends(no_store)],
)

ItemId = Annotated[int, Path(ge=1, le=2**63 - 1)]
_STOCK: dict[int | str, dict[str, Any]] = {
    409: {"model": ProblemDetail, "description": "Not enough stock (`available` says how much)"},
    404: {"model": ProblemDetail, "description": "Unknown product or cart item"},
    422: {"model": ProblemDetail, "description": "Invalid size or quantity"},
}


@router.get("", summary="The current cart (the user's, or the guest's)")
async def get_cart(owner: CartOwnerDep, service: CartServiceDep) -> CartOut:
    return await service.get(owner)


@router.post(
    "/items", summary="Add a product (adds up with the same product and size)", responses=_STOCK
)
async def add_item(body: CartItemIn, owner: CartWriterDep, service: CartServiceDep) -> CartOut:
    return await service.add_item(owner, body)


@router.patch("/items/{item_id}", summary="Set a line's quantity", responses=_STOCK)
async def update_item(
    item_id: ItemId, body: CartItemUpdate, owner: CartWriterDep, service: CartServiceDep
) -> CartOut:
    return await service.set_quantity(owner, item_id, body.quantity)


@router.delete("/items/{item_id}", summary="Remove a line", responses=_STOCK)
async def remove_item(item_id: ItemId, owner: CartWriterDep, service: CartServiceDep) -> CartOut:
    return await service.remove_item(owner, item_id)


@router.delete("", summary="Empty the cart")
async def clear_cart(owner: CartWriterDep, service: CartServiceDep) -> CartOut:
    return await service.clear(owner)
