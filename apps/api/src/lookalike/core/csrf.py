"""Cross-site request protection for endpoints that act on a cookie.

Bearer-token endpoints are immune to CSRF (the browser never attaches the header on its own).
The refresh cookie and the guest-cart cookie are attached automatically, so requests that change
state on the strength of them must come from our own site. SameSite=Lax already blocks the
common cases; this is the second layer: reject a browser request whose `Origin` is not ours.
Non-browser clients (curl, server-side code) send neither header and are allowed: they cannot be
tricked into riding a victim's cookie.
"""

from fastapi import Request

from lookalike.core.config import Settings
from lookalike.core.errors import FORBIDDEN_ORIGIN_TYPE, ProblemError

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _forbidden() -> ProblemError:
    return ProblemError(
        403,
        "Cross-site request refused",
        "This request did not come from an allowed origin.",
        type_=FORBIDDEN_ORIGIN_TYPE,
    )


async def require_same_origin(request: Request) -> None:
    if request.method in _SAFE_METHODS:
        return
    settings: Settings = request.app.state.settings
    origin = request.headers.get("origin")
    if origin is not None:
        if origin not in settings.cors_origins:
            raise _forbidden()
        return
    # No Origin (older browsers on same-origin requests): Fetch Metadata still tells.
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise _forbidden()
