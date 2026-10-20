"""Cookie дээр тулгуурласан endpoint-уудыг cross-site хүсэлтээс хамгаална.

Bearer-token endpoint CSRF-д автоматаар өртөхгүй (browser header-ийг өөрөө хавсаргадаггүй).
Refresh, guest-cart cookie-ууд автоматаар хавсарддаг тул тэдгээрээр төлөв өөрчилдөг хүсэлт
манай сайтаас ирсэн байх ёстой. SameSite=Lax ихэнх тохиолдлыг хаадаг; энэ нь хоёр дахь давхарга:
`Origin` нь манайх биш browser хүсэлтийг татгалзана. Browser биш клиент (curl, server код)
эдгээр header-ийг илгээдэггүй тул зөвшөөрнө: тэднийг хохирогчийн cookie ашиглуулж хууран
мэхэлж чадахгүй.
"""

from fastapi import Request

from angel.core.config import Settings
from angel.core.errors import FORBIDDEN_ORIGIN_TYPE, ProblemError

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
    # Origin байхгүй (хуучин browser-ийн same-origin хүсэлт): Fetch Metadata-гаар мэдэж болно.
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise _forbidden()
