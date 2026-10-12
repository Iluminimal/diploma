import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from fastapi.responses import RedirectResponse

from angel.core.cookies import (
    CART_COOKIE,
    OAUTH_COOKIE,
    REFRESH_COOKIE,
    clear_cart_cookie,
    clear_oauth_cookie,
    clear_session_cookies,
    set_oauth_cookie,
    set_session_cookies,
)
from angel.core.csrf import require_same_origin
from angel.core.deps import (
    AccountServiceDep,
    AuthServiceDep,
    CurrentUserDep,
    OAuthServiceDep,
    OtpLoginServiceDep,
    PasswordResetServiceDep,
    SettingsDep,
    no_store,
)
from angel.core.errors import ProblemError
from angel.core.rate_limit import rate_limit
from angel.schemas.accounts.auth import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    DeviceSession,
    EmailChangeRequest,
    EmailConfirmRequest,
    ForgotPasswordRequest,
    LoginRequest,
    OtpRequest,
    OtpVerifyRequest,
    PhoneChangeRequest,
    PhoneConfirmRequest,
    ProvidersOut,
    RegisterRequest,
    RemoveContactRequest,
    ResetPasswordRequest,
    SessionOut,
    UpdateProfileRequest,
    UserOut,
    VerifyCodeRequest,
)
from angel.schemas.problem import ProblemDetail
from angel.services.accounts.auth import IssuedSession
from angel.services.accounts.oauth import OAuthFailure, login_error_url

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
        user=issued.user.out(),
        is_new_user=issued.is_new_user,
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
    "/otp/request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a sign-in code to a phone number or an email address",
    dependencies=[Depends(rate_limit("otp_send"))],
    responses={
        422: {"model": ProblemDetail, "description": "Not a valid phone number or email"},
        429: {"model": ProblemDetail, "description": "A code was sent a moment ago"},
        503: {"model": ProblemDetail, "description": "The text message could not be sent"},
    },
)
async def otp_request(body: OtpRequest, service: OtpLoginServiceDep) -> None:
    await service.request_code(body.destination)


@router.post(
    "/otp/verify",
    summary="Sign in (or sign up) with a code; merges the guest cart into the account's",
    dependencies=[Depends(rate_limit("otp_verify"))],
    responses={
        400: {"model": ProblemDetail, "description": "Wrong or expired code"},
        429: {"model": ProblemDetail, "description": "Too many wrong codes"},
    },
)
async def otp_verify(
    body: OtpVerifyRequest,
    response: Response,
    service: OtpLoginServiceDep,
    settings: SettingsDep,
    guest_cart: GuestCartCookie = None,
) -> SessionOut:
    issued = await service.sign_in(body.destination, body.code, guest_cart)
    return _respond(issued, response, settings)


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
    return (await service.me(user_id)).out()


@router.patch("/me", summary="Change the name on the account", responses=_UNAUTHORIZED)
async def update_me(
    body: UpdateProfileRequest, user_id: CurrentUserDep, service: AccountServiceDep
) -> UserOut:
    return (await service.update_name(user_id, body.full_name)).out()


_CODE_ERRORS: dict[int | str, dict[str, Any]] = {
    400: {"model": ProblemDetail, "description": "Wrong or expired code"},
    429: {"model": ProblemDetail, "description": "Too many wrong codes, or a code was just sent"},
}


@router.post(
    "/password/forgot",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a password-reset code to the phone number or email on an account",
    description="Always answers 202, whether or not an account exists.",
    dependencies=[Depends(rate_limit("otp_send"))],
)
async def forgot_password(body: ForgotPasswordRequest, service: PasswordResetServiceDep) -> None:
    await service.forgot(body.destination)


@router.post(
    "/password/reset",
    summary="Choose a new password with the code; signs in and ends every other login",
    dependencies=[Depends(rate_limit("otp_verify"))],
    responses=_CODE_ERRORS,
)
async def reset_password(
    body: ResetPasswordRequest,
    response: Response,
    service: PasswordResetServiceDep,
    settings: SettingsDep,
) -> SessionOut:
    issued = await service.reset(body.destination, body.code, body.new_password)
    return _respond(issued, response, settings)


@router.post(
    "/email/verify/request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send a code to the account's email to confirm it",
    dependencies=[Depends(rate_limit("otp_send"))],
    responses=_UNAUTHORIZED,
)
async def request_email_verification(user_id: CurrentUserDep, service: AccountServiceDep) -> None:
    await service.request_email_verification(user_id)


@router.post(
    "/email/verify/confirm",
    summary="Confirm the account's email with the code",
    dependencies=[Depends(rate_limit("otp_verify"))],
    responses={**_UNAUTHORIZED, **_CODE_ERRORS},
)
async def confirm_email_verification(
    body: VerifyCodeRequest, user_id: CurrentUserDep, service: AccountServiceDep
) -> UserOut:
    return (await service.confirm_email_verification(user_id, body.code)).out()


@router.post(
    "/phone/request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Add or replace the phone number: send a code to the new number",
    dependencies=[Depends(rate_limit("otp_send"))],
    responses={
        **_UNAUTHORIZED,
        403: {"model": ProblemDetail, "description": "The current password is wrong"},
        409: {"model": ProblemDetail, "description": "Another account uses this number"},
    },
)
async def request_phone(
    body: PhoneChangeRequest, user_id: CurrentUserDep, service: AccountServiceDep
) -> None:
    await service.request_phone(user_id, body.phone, body.current_password)


@router.post(
    "/phone/confirm",
    summary="Save the new phone number once the code is right",
    dependencies=[Depends(rate_limit("otp_verify"))],
    responses={**_UNAUTHORIZED, **_CODE_ERRORS},
)
async def confirm_phone(
    body: PhoneConfirmRequest, user_id: CurrentUserDep, service: AccountServiceDep
) -> UserOut:
    return (await service.confirm_phone(user_id, body.phone, body.code)).out()


@router.delete(
    "/phone",
    summary="Remove the phone number (the account must keep an email)",
    responses={
        **_UNAUTHORIZED,
        403: {"model": ProblemDetail, "description": "The current password is wrong"},
        409: {"model": ProblemDetail, "description": "It is the only way to sign in"},
    },
)
async def remove_phone(
    user_id: CurrentUserDep,
    service: AccountServiceDep,
    body: RemoveContactRequest | None = None,
) -> UserOut:
    return (await service.remove_phone(user_id, body.current_password if body else None)).out()


@router.post(
    "/email/request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Add or replace the email: send a code to the new address",
    dependencies=[Depends(rate_limit("otp_send"))],
    responses={
        **_UNAUTHORIZED,
        403: {"model": ProblemDetail, "description": "The current password is wrong"},
        409: {"model": ProblemDetail, "description": "Another account uses this address"},
    },
)
async def request_email(
    body: EmailChangeRequest, user_id: CurrentUserDep, service: AccountServiceDep
) -> None:
    await service.request_email(user_id, body.email, body.current_password)


@router.post(
    "/email/confirm",
    summary="Save the new email once the code is right",
    dependencies=[Depends(rate_limit("otp_verify"))],
    responses={**_UNAUTHORIZED, **_CODE_ERRORS},
)
async def confirm_email(
    body: EmailConfirmRequest, user_id: CurrentUserDep, service: AccountServiceDep
) -> UserOut:
    return (await service.confirm_email(user_id, body.email, body.code)).out()


@router.delete(
    "/email",
    summary="Remove the email (the account must keep a phone number)",
    responses={
        **_UNAUTHORIZED,
        403: {"model": ProblemDetail, "description": "The current password is wrong"},
        409: {"model": ProblemDetail, "description": "It is the only way to sign in"},
    },
)
async def remove_email(
    user_id: CurrentUserDep,
    service: AccountServiceDep,
    body: RemoveContactRequest | None = None,
) -> UserOut:
    return (await service.remove_email(user_id, body.current_password if body else None)).out()


@router.get("/sessions", summary="The devices signed in to this account", responses=_UNAUTHORIZED)
async def list_sessions(
    user_id: CurrentUserDep, service: AccountServiceDep, refresh_token: RefreshCookie = None
) -> list[DeviceSession]:
    return await service.sessions(user_id, refresh_token)


@router.post(
    "/sessions/revoke-others",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign out everywhere except this browser",
    responses=_UNAUTHORIZED,
)
async def revoke_other_sessions(
    user_id: CurrentUserDep, service: AccountServiceDep, refresh_token: RefreshCookie = None
) -> None:
    await service.revoke_other_sessions(user_id, refresh_token)


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Sign one device out",
    responses={
        **_UNAUTHORIZED,
        404: {"model": ProblemDetail, "description": "That login is already over"},
    },
)
async def revoke_session(
    session_id: uuid.UUID,
    response: Response,
    user_id: CurrentUserDep,
    service: AccountServiceDep,
    settings: SettingsDep,
    refresh_token: RefreshCookie = None,
) -> None:
    if await service.revoke_session(user_id, session_id, refresh_token):
        clear_session_cookies(response, settings)


@router.put(
    "/password",
    summary="Set or change the password",
    description="Accounts that have a password must send the current one; Google-only accounts "
    "can simply set one. Every other login ends and this browser gets a new session.",
    dependencies=[Depends(rate_limit("login"))],
    responses={
        **_UNAUTHORIZED,
        403: {"model": ProblemDetail, "description": "The current password is wrong"},
    },
)
async def change_password(
    body: ChangePasswordRequest,
    response: Response,
    user_id: CurrentUserDep,
    service: AccountServiceDep,
    settings: SettingsDep,
) -> SessionOut:
    return _respond(await service.change_password(user_id, body), response, settings)


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete the account",
    description="The account is anonymized: its details are removed and nobody can sign in to it, "
    "but past orders are kept for the shop's records. Administrators cannot do this here.",
    dependencies=[Depends(rate_limit("login"))],
    responses={
        **_UNAUTHORIZED,
        403: {"model": ProblemDetail, "description": "Wrong password, or an administrator"},
        422: {"model": ProblemDetail, "description": "The typed email does not match"},
    },
)
async def delete_me(
    body: DeleteAccountRequest,
    response: Response,
    user_id: CurrentUserDep,
    service: AccountServiceDep,
    settings: SettingsDep,
) -> None:
    await service.delete(user_id, body)
    clear_session_cookies(response, settings)
    clear_cart_cookie(response, settings)


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
