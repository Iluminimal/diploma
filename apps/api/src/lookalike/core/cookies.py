"""The three cookies the API sets.

* `lk_refresh`: the refresh token. httpOnly (scripts cannot read it), SameSite=Lax, and scoped to
  the auth endpoints so it is not sent with every request.
* `lk_session`: "1" while a refresh cookie exists. Not a secret and not httpOnly, so the web
  app's edge proxy can redirect signed-out visitors without calling the API. It grants nothing.
* `lk_cart`: the guest cart's random id. httpOnly, scoped to the API.
* `lk_oauth`: the signed state of a sign-in with Google in progress (ten minutes, httpOnly,
  scoped to the Google endpoints). Lax, so it comes back with Google's redirect.
"""

from fastapi import Response

from lookalike.core.config import Settings

REFRESH_COOKIE = "lk_refresh"
SESSION_COOKIE = "lk_session"
CART_COOKIE = "lk_cart"
OAUTH_COOKIE = "lk_oauth"


def _refresh_path(settings: Settings) -> str:
    return f"{settings.api_v1_prefix}/auth"


def set_session_cookies(
    response: Response, settings: Settings, refresh_token: str, max_age: int
) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=max_age,
        path=_refresh_path(settings),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.set_cookie(
        SESSION_COOKIE,
        "1",
        max_age=max_age,
        path="/",
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_session_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=_refresh_path(settings),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
    response.delete_cookie(SESSION_COOKIE, path="/", secure=settings.cookie_secure, samesite="lax")


def set_cart_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        CART_COOKIE,
        token,
        max_age=settings.cart_guest_ttl_days * 24 * 3600,
        path=settings.api_v1_prefix,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_cart_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        CART_COOKIE,
        path=settings.api_v1_prefix,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _oauth_path(settings: Settings) -> str:
    return f"{settings.api_v1_prefix}/auth/google"


def set_oauth_cookie(response: Response, settings: Settings, value: str, max_age: int) -> None:
    response.set_cookie(
        OAUTH_COOKIE,
        value,
        max_age=max_age,
        path=_oauth_path(settings),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def clear_oauth_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        OAUTH_COOKIE,
        path=_oauth_path(settings),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )
