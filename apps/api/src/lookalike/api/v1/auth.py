from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from fastapi.responses import RedirectResponse

from lookalike.core.cookies import (
    CART_COOKIE,
    OAUTH_COOKIE,
    REFRESH_COOKIE,
    clear_cart_cookie,
    clear_oauth_cookie,
    clear_session_cookies,
    set_oauth_cookie,
    set_session_cookies,
)
from lookalike.core.csrf import require_same_origin
from lookalike.core.deps import (
    AuthServiceDep,
    CurrentUserDep,
    OAuthServiceDep,
    SettingsDep,
    no_store,
)
from lookalike.core.errors import ProblemError
from lookalike.core.rate_limit import rate_limit
from lookalike.schemas.auth import (
    LoginRequest,
    ProvidersOut,
    RegisterRequest,
    SessionOut,
    UserOut,
)
from lookalike.schemas.problem import ProblemDetail
from lookalike.services.auth import IssuedSession
from lookalike.services.oauth import OAuthFailure, login_error_url

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
OAuthCookie = Annotated[str | None, Cookie(alias=OAUTH_COOKIE, include_in_schema=False)]


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


# --- sign in with Google -------------------------------------------------------------------------
# Both endpoints are navigations, not fetches: the browser follows their redirects, so they answer
# with redirects (never JSON) and a failure ends on the login page with a short `?error=` code.


@router.get("/providers", summary="Which sign-in methods besides a password are available")
async def providers(settings: SettingsDep) -> ProvidersOut:
    return ProvidersOut(google=settings.google_enabled)


def _redirect(url: str) -> RedirectResponse:
    return RedirectResponse(
        url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": "no-store"}
    )


@router.get(
    "/google/start",
    summary="Send the browser to Google to sign in",
    status_code=status.HTTP_302_FOUND,
    response_class=RedirectResponse,
    dependencies=[Depends(rate_limit("oauth"))],
    responses={404: {"model": ProblemDetail, "description": "Google sign-in is not configured"}},
)
async def google_start(
    service: OAuthServiceDep,
    settings: SettingsDep,
    next: Annotated[
        str | None, Query(max_length=500, description="Same-site path to return to")
    ] = None,
    login_hint: Annotated[str | None, Query(max_length=320, include_in_schema=False)] = None,
) -> RedirectResponse:
    if service is None:
        raise ProblemError(404, "Not available", "Sign in with Google is not configured.")
    start = service.begin(next, login_hint)
    response = _redirect(start.url)
    set_oauth_cookie(response, settings, start.cookie_value, start.cookie_max_age)
    return response


@router.get(
    "/google/callback",
    summary="Where Google sends the browser back to",
    status_code=status.HTTP_302_FOUND,
    response_class=RedirectResponse,
    dependencies=[Depends(rate_limit("oauth"))],
)
async def google_callback(
    service: OAuthServiceDep,
    settings: SettingsDep,
    code: Annotated[str | None, Query(max_length=2048)] = None,
    state: Annotated[str | None, Query(max_length=256)] = None,
    error: Annotated[str | None, Query(max_length=100)] = None,
    flow_cookie: OAuthCookie = None,
    guest_cart: GuestCartCookie = None,
) -> RedirectResponse:
    def fail(reason: str) -> RedirectResponse:
        response = _redirect(login_error_url(settings, reason))
        clear_oauth_cookie(response, settings)
        return response

    if service is None:
        return fail("google_failed")
    if error is not None:
        # "access_denied" is the person pressing Cancel; anything else is Google or us failing.
        return fail("google_denied" if error == "access_denied" else "google_failed")
    if not code or not state:
        return fail("google_failed")
    try:
        result = await service.complete(
            code=code, state=state, flow_cookie=flow_cookie, guest_cart_token=guest_cart
        )
    except OAuthFailure as failure:
        return fail(failure.reason)
    response = _redirect(f"{settings.web_base_url.rstrip('/')}{result.next_path}")
    set_session_cookies(
        response, settings, result.session.refresh_token, result.session.refresh_max_age
    )
    clear_cart_cookie(response, settings)
    clear_oauth_cookie(response, settings)
    return response
