from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from angel.core.logging import get_logger
from angel.core.request_context import REQUEST_ID_HEADER, get_request_id
from angel.schemas.problem import FieldError, ProblemDetail

PROBLEM_JSON = "application/problem+json"

_PREFIX = "urn:angel:problem:"
PRODUCT_NOT_FOUND_TYPE = f"{_PREFIX}product-not-found"
UNAUTHENTICATED_TYPE = f"{_PREFIX}unauthenticated"
INVALID_CREDENTIALS_TYPE = f"{_PREFIX}invalid-credentials"
EMAIL_TAKEN_TYPE = f"{_PREFIX}email-taken"
FORBIDDEN_ORIGIN_TYPE = f"{_PREFIX}forbidden-origin"
FORBIDDEN_TYPE = f"{_PREFIX}forbidden"
ADDRESS_NOT_FOUND_TYPE = f"{_PREFIX}address-not-found"
CART_ITEM_NOT_FOUND_TYPE = f"{_PREFIX}cart-item-not-found"
ORDER_NOT_FOUND_TYPE = f"{_PREFIX}order-not-found"
INVALID_SIZE_TYPE = f"{_PREFIX}invalid-size"
INSUFFICIENT_STOCK_TYPE = f"{_PREFIX}insufficient-stock"
CART_EMPTY_TYPE = f"{_PREFIX}cart-empty"
CHECKOUT_BUSY_TYPE = f"{_PREFIX}checkout-busy"
CART_FULL_TYPE = f"{_PREFIX}cart-full"
PAYMENTS_UNAVAILABLE_TYPE = f"{_PREFIX}payments-unavailable"
PAYMENT_PROVIDER_TYPE = f"{_PREFIX}payment-provider-error"
PAYMENT_IN_PROGRESS_TYPE = f"{_PREFIX}payment-in-progress"
INVALID_SIGNATURE_TYPE = f"{_PREFIX}invalid-signature"
ADDRESS_LIMIT_TYPE = f"{_PREFIX}address-limit"
WISHLIST_FULL_TYPE = f"{_PREFIX}wishlist-full"
INVALID_CATEGORY_TYPE = f"{_PREFIX}invalid-category"
CATEGORY_NOT_FOUND_TYPE = f"{_PREFIX}category-not-found"
INVALID_TRANSITION_TYPE = f"{_PREFIX}invalid-order-transition"
REVIEW_NOT_FOUND_TYPE = f"{_PREFIX}review-not-found"
REVIEW_NOT_ALLOWED_TYPE = f"{_PREFIX}review-not-allowed"
REVIEW_EXISTS_TYPE = f"{_PREFIX}review-exists"

log = get_logger(__name__)


class ProblemError(StarletteHTTPException):
    """Raise from services to produce an RFC 7807 response. Routes never build errors by hand.

    It is an HTTPException on purpose: FastAPI turns every other exception raised while it
    parses a request body into a generic 400, and it must not do that to "413 too large".
    """

    def __init__(
        self,
        status_code: int,
        title: str,
        detail: str | None = None,
        *,
        type_: str = "about:blank",
        extensions: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code, detail or title, headers or {})
        self.title = title
        self.detail = detail  # type: ignore[assignment]  # None = omit from the response
        self.type = type_
        self.extensions = extensions or {}


def problem_response(
    request: Request, problem: ProblemDetail, headers: dict[str, str] | None = None
) -> JSONResponse:
    problem.instance = request.url.path
    request_id = get_request_id(request.scope)
    problem.request_id = request_id
    response_headers = dict(headers or {})
    if request_id:
        # The 500 handler runs outside RequestContextMiddleware, so set the header here too.
        response_headers[REQUEST_ID_HEADER] = request_id
    return JSONResponse(
        problem.model_dump(exclude_none=True),
        status_code=problem.status,
        media_type=PROBLEM_JSON,
        headers=response_headers,
    )


async def _handle_problem_error(request: Request, exc: ProblemError) -> JSONResponse:
    problem = ProblemDetail(
        type=exc.type,
        title=exc.title,
        status=exc.status_code,
        detail=exc.detail,
        **exc.extensions,
    )
    return problem_response(request, problem, dict(exc.headers or {}))


async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    try:
        title = HTTPStatus(exc.status_code).phrase
    except ValueError:
        title = "Error"
    problem = ProblemDetail(
        title=title, status=exc.status_code, detail=str(exc.detail) if exc.detail else None
    )
    return problem_response(request, problem, dict(exc.headers or {}))


async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Deliberately drop `input` and `ctx`: they can echo user data or be unserializable.
    errors = [
        FieldError(loc=[str(part) for part in err["loc"]], msg=err["msg"], type=err["type"])
        for err in exc.errors()
    ]
    problem = ProblemDetail(
        title="Request validation failed",
        status=HTTPStatus.UNPROCESSABLE_ENTITY,
        detail="One or more fields are invalid.",
        errors=errors,
    )
    return problem_response(request, problem)


async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    log.error("unhandled_exception", exc_info=exc)
    problem = ProblemDetail(title="Internal Server Error", status=HTTPStatus.INTERNAL_SERVER_ERROR)
    return problem_response(request, problem)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ProblemError, _handle_problem_error)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _handle_validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _handle_unexpected_error)
