"""Products and stock: the catalogue as the shop's staff see it, withdrawn items included."""

from typing import Annotated, Any

from fastapi import APIRouter, Form, Path, Query, status

from angel.core.deps import (
    AdminProductServiceDep,
    SettingsDep,
)
from angel.core.uploads import read_image_upload
from angel.schemas.admin.dashboard import (
    StockUpdate,
)
from angel.schemas.admin.products import (
    AdminCategory,
    AdminProductCreateForm,
    AdminProductImageForm,
    AdminProductListQuery,
    AdminProductOut,
    AdminProductPage,
    AdminProductUpdate,
    ProductFields,
)
from angel.schemas.problem import ProblemDetail

# Rate limit first so guessing tokens against the admin area is throttled; then the role check.

router = APIRouter()

_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "No such product"}
}

_UPLOAD: dict[int | str, dict[str, Any]] = {
    413: {"model": ProblemDetail, "description": "Image larger than the upload limit"},
    415: {"model": ProblemDetail, "description": "Not a JPEG, PNG or WebP upload"},
    422: {"model": ProblemDetail, "description": "Invalid image or fields"},
}


@router.get("/categories", summary="Article types a product can be filed under")
async def list_categories(service: AdminProductServiceDep) -> list[AdminCategory]:
    return await service.categories()


@router.get("/products", summary="All products, withdrawn ones included")
async def list_products(
    query: Annotated[AdminProductListQuery, Query()], service: AdminProductServiceDep
) -> AdminProductPage:
    return await service.list_products(query)


@router.get("/products/{product_id}", summary="One product", responses=_NOT_FOUND)
async def get_product(product_id: int, service: AdminProductServiceDep) -> AdminProductOut:
    return await service.get(product_id)


@router.post(
    "/products",
    status_code=status.HTTP_201_CREATED,
    summary="Create a product from a photo",
    description="Thumbnails and the visual-search embedding are computed from the photo.",
    responses=_UPLOAD,
)
async def create_product(
    form: Annotated[AdminProductCreateForm, Form()],
    service: AdminProductServiceDep,
    settings: SettingsDep,
) -> AdminProductOut:
    data = await read_image_upload(form.file, settings.max_upload_bytes)
    fields = ProductFields.model_validate(form.model_dump(exclude={"file", "is_active"}))
    return await service.create(data, fields, is_active=form.is_active)


@router.patch(
    "/products/{product_id}",
    summary="Change a product's details",
    responses={**_NOT_FOUND, 422: _UPLOAD[422]},
)
async def update_product(
    product_id: int, changes: AdminProductUpdate, service: AdminProductServiceDep
) -> AdminProductOut:
    return await service.update(product_id, changes)


@router.put(
    "/products/{product_id}/image",
    summary="Replace a product's photo and recompute its embedding",
    responses={**_NOT_FOUND, **_UPLOAD},
)
async def replace_image(
    product_id: int,
    form: Annotated[AdminProductImageForm, Form()],
    service: AdminProductServiceDep,
    settings: SettingsDep,
) -> AdminProductOut:
    data = await read_image_upload(form.file, settings.max_upload_bytes)
    return await service.replace_image(product_id, data)


@router.post(
    "/products/{product_id}/deactivate",
    summary="Withdraw a product from the store",
    description="Hidden from listing, search and similar products; existing orders keep it.",
    responses=_NOT_FOUND,
)
async def deactivate_product(product_id: int, service: AdminProductServiceDep) -> AdminProductOut:
    return await service.set_active(product_id, active=False)


@router.post("/products/{product_id}/activate", summary="Put a product back", responses=_NOT_FOUND)
async def activate_product(product_id: int, service: AdminProductServiceDep) -> AdminProductOut:
    return await service.set_active(product_id, active=True)


@router.put(
    "/products/{product_id}/stock",
    summary="Set how many are on the shelf",
    responses=_NOT_FOUND,
)
async def set_product_stock(
    product_id: Annotated[int, Path(ge=1, le=2**63 - 1)],
    body: StockUpdate,
    service: AdminProductServiceDep,
) -> AdminProductOut:
    return await service.set_stock(product_id, body.quantity)
