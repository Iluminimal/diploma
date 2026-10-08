from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, Response, status

from lookalike.core.cookies import (
    CART_COOKIE,
    REFRESH_COOKIE,
    clear_cart_cookie,
    clear_session_cookies,
    set_session_cookies,
)
from lookalike.core.csrf import require_same_origin
from lookalike.core.deps import AuthServiceDep, CurrentUserDep, SettingsDep, no_store
from lookalike.core.rate_limit import rate_limit
from lookalike.schemas.auth import LoginRequest, RegisterRequest, SessionOut, UserOut
from lookalike.schemas.problem import ProblemDetail
from lookalike.services.auth import IssuedSession

# Every endpoint here either sets or reads a cookie, so all of them check the request's origin.
router = APIRouter(
    prefix="/auth",
    tags=["auth"],
    dependencies=[Depends(require_same_origin), Depends(no_store)],
)

_UNAUTHORIZED: dict[int | str, dict[str, Any]] = {
    401: {"model": ProblemDetail, "description": "Not signed in or credentials rejected"}
}
GuestCartCookie = Annotated[str | None, Cookie(alias=CART_COOKIE, include_in_schema=False)]
RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE, include_in_schema=False)]


def _respond(issued: IssuedSession, response: Response, settings: SettingsDep) -> SessionOut:
    set_session_cookies(response, settings, issued.refresh_token, issued.refresh_max_age)
    # The guest cart was merged into the account's: the cookie has done its job.
    clear_cart_cookie(response, settings)
    return SessionOut(
        access_token=issued.access.value,
        expires_in=issued.access.expires_in,
        user=UserOut.model_validate(issued.user),
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Create an account and sign in",
    dependencies=[Depends(rate_limit("register"))],
    responses={409: {"model": ProblemDetail, "description": "Email already registered"}},
)
async def register(
    body: RegisterRequest,
    response: Response,
    service: AuthServiceDep,
    settings: SettingsDep,
    guest_cart: GuestCartCookie = None,
) -> SessionOut:
    return _respond(await service.register(body, guest_cart), response, settings)


@router.post(
    "/login",
    summary="Sign in (merges the guest cart into the account's)",
    dependencies=[Depends(rate_limit("login"))],
    responses=_UNAUTHORIZED,
)
async def login(
    body: LoginRequest,
    response: Response,
    service: AuthServiceDep,
    settings: SettingsDep,
    guest_cart: GuestCartCookie = None,
) -> SessionOut:
    return _respond(await service.login(body, guest_cart), response, settings)


@router.post(
    "/refresh",
    summary="Trade the refresh cookie for a new access token (and a new refresh cookie)",
    dependencies=[Depends(rate_limit("refresh"))],
    responses=_UNAUTHORIZED,
)
async def refresh(
    response: Response,
    service: AuthServiceDep,
    settings: SettingsDep,
    refresh_token: RefreshCookie = None,
) -> SessionOut:
    return _respond(await service.refresh(refresh_token), response, settings)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="End this session",
)
async def logout(
    response: Response,
    service: AuthServiceDep,
    settings: SettingsDep,
    refresh_token: RefreshCookie = None,
) -> None:
    await service.logout(refresh_token)
    clear_session_cookies(response, settings)


@router.get("/me", summary="The signed-in user", responses=_UNAUTHORIZED)
async def me(user_id: CurrentUserDep, service: AuthServiceDep) -> UserOut:
    return UserOut.model_validate(await service.me(user_id))
