from typing import Annotated, Any

from fastapi import APIRouter, Depends, Form, Path, Query, status

from lookalike.core.deps import (
    AdminDashboardServiceDep,
    AdminDep,
    AdminOrderServiceDep,
    AdminProductServiceDep,
    FulfillmentServiceDep,
    ReviewServiceDep,
    SettingsDep,
    get_current_admin,
    no_store,
)
from lookalike.core.rate_limit import rate_limit
from lookalike.core.uploads import read_image_upload
from lookalike.schemas.admin import (
    AdminCategory,
    AdminOrderListQuery,
    AdminOrderOut,
    AdminOrderPage,
    AdminProductCreateForm,
    AdminProductImageForm,
    AdminProductListQuery,
    AdminProductOut,
    AdminProductPage,
    AdminProductUpdate,
    CancelRequest,
    NoteRequest,
    ProductFields,
    RefundRequest,
    ShipRequest,
)
from lookalike.schemas.admin_dashboard import (
    AdminCustomerDetail,
    AdminCustomerListQuery,
    AdminCustomerPage,
    AdminStats,
    StatsQuery,
    StockUpdate,
)
from lookalike.schemas.problem import ProblemDetail
from lookalike.schemas.review import AdminReviewListQuery, AdminReviewOut, AdminReviewPage

# Rate limit first so guessing tokens against the admin area is throttled; then the role check.
router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(rate_limit("admin")), Depends(get_current_admin), Depends(no_store)],
    responses={
        401: {"model": ProblemDetail, "description": "Not signed in"},
        403: {"model": ProblemDetail, "description": "Not an administrator"},
        429: {"model": ProblemDetail, "description": "Rate limit exceeded"},
    },
)

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


@router.get("/orders", summary="Every customer's orders, newest first")
async def list_orders(
    query: Annotated[AdminOrderListQuery, Query()], service: AdminOrderServiceDep
) -> AdminOrderPage:
    return await service.list(query)


@router.get(
    "/orders/{number}",
    summary="One order with its payment record",
    responses={404: {"model": ProblemDetail, "description": "No such order"}},
)
async def get_order(
    number: Annotated[str, Path(min_length=4, max_length=20)], service: AdminOrderServiceDep
) -> AdminOrderOut:
    return await service.get(number)


# --- order actions ----------------------------------------------------------------------------

_CONFLICT: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "No such order"},
    409: {"model": ProblemDetail, "description": "The order is not in a state this applies to"},
}


@router.post("/orders/{number}/ship", summary="Mark a paid order as shipped", responses=_CONFLICT)
async def ship_order(
    number: Annotated[str, Path(max_length=20)],
    body: ShipRequest,
    admin: AdminDep,
    service: FulfillmentServiceDep,
) -> AdminOrderOut:
    return await service.ship(number, admin, body)


@router.post(
    "/orders/{number}/deliver", summary="Mark a shipped order as delivered", responses=_CONFLICT
)
async def deliver_order(
    number: Annotated[str, Path(max_length=20)], admin: AdminDep, service: FulfillmentServiceDep
) -> AdminOrderOut:
    return await service.deliver(number, admin)


@router.post(
    "/orders/{number}/cancel",
    summary="Cancel an unpaid order",
    description="Gives the reserved stock back. A paid order is refunded instead.",
    responses=_CONFLICT,
)
async def cancel_order(
    number: Annotated[str, Path(max_length=20)],
    admin: AdminDep,
    service: FulfillmentServiceDep,
    body: CancelRequest | None = None,
) -> AdminOrderOut:
    return await service.cancel(number, admin, body or CancelRequest())


@router.post(
    "/orders/{number}/refund",
    summary="Refund a paid, shipped or delivered order in full",
    responses={**_CONFLICT, 502: {"model": ProblemDetail, "description": "Provider unavailable"}},
)
async def refund_order(
    number: Annotated[str, Path(max_length=20)],
    body: RefundRequest,
    admin: AdminDep,
    service: FulfillmentServiceDep,
) -> AdminOrderOut:
    return await service.refund(number, admin, body)


@router.post("/orders/{number}/notes", summary="Add an internal note", responses=_CONFLICT)
async def add_order_note(
    number: Annotated[str, Path(max_length=20)],
    body: NoteRequest,
    admin: AdminDep,
    service: FulfillmentServiceDep,
) -> AdminOrderOut:
    return await service.add_note(number, admin, body)


# --- dashboard, customers, stock ----------------------------------------------------------------


@router.get("/stats", summary="The dashboard: figures for a period against the one before it")
async def stats(
    query: Annotated[StatsQuery, Query()], service: AdminDashboardServiceDep
) -> AdminStats:
    return await service.stats(query.days)


@router.get("/customers", summary="Customers with what they have bought")
async def list_customers(
    query: Annotated[AdminCustomerListQuery, Query()], service: AdminDashboardServiceDep
) -> AdminCustomerPage:
    return await service.customers(query)


@router.get(
    "/customers/{user_id}",
    summary="One customer with their latest orders",
    responses={404: {"model": ProblemDetail, "description": "No such customer"}},
)
async def get_customer(
    user_id: Annotated[int, Path(ge=1, le=2**63 - 1)], service: AdminDashboardServiceDep
) -> AdminCustomerDetail:
    return await service.customer(user_id)


_CUSTOMER_ACTION: dict[int | str, dict[str, Any]] = {
    403: {"model": ProblemDetail, "description": "Yourself or an administrator"},
    404: {"model": ProblemDetail, "description": "No such customer"},
}


@router.post(
    "/customers/{user_id}/deactivate",
    summary="Suspend a customer",
    description="They are signed out everywhere and cannot sign in again until reinstated.",
    responses=_CUSTOMER_ACTION,
)
async def deactivate_customer(
    user_id: Annotated[int, Path(ge=1, le=2**63 - 1)],
    admin: AdminDep,
    service: AdminDashboardServiceDep,
) -> AdminCustomerDetail:
    return await service.set_active(admin, user_id, active=False)


@router.post(
    "/customers/{user_id}/activate", summary="Reinstate a customer", responses=_CUSTOMER_ACTION
)
async def activate_customer(
    user_id: Annotated[int, Path(ge=1, le=2**63 - 1)],
    admin: AdminDep,
    service: AdminDashboardServiceDep,
) -> AdminCustomerDetail:
    return await service.set_active(admin, user_id, active=True)


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


# --- review moderation --------------------------------------------------------------------------


@router.get("/reviews", summary="Every review, newest first, with counts per status")
async def list_reviews(
    query: Annotated[AdminReviewListQuery, Query()], service: ReviewServiceDep
) -> AdminReviewPage:
    return await service.admin_list(query)


_REVIEW_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "No such review"}
}


@router.post(
    "/reviews/{review_id}/hide",
    summary="Take a review off the product page and out of the average",
    responses=_REVIEW_NOT_FOUND,
)
async def hide_review(
    review_id: Annotated[int, Path(ge=1, le=2**63 - 1)], service: ReviewServiceDep
) -> AdminReviewOut:
    return await service.set_status(review_id, published=False)


@router.post(
    "/reviews/{review_id}/publish",
    summary="Put a hidden review back",
    responses=_REVIEW_NOT_FOUND,
)
async def publish_review(
    review_id: Annotated[int, Path(ge=1, le=2**63 - 1)], service: ReviewServiceDep
) -> AdminReviewOut:
    return await service.set_status(review_id, published=True)
