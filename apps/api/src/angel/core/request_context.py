import re
import time
import uuid

import structlog
from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"
# Дуудагчийн өгсөн ID-г зөвхөн богино, log-д аюулгүй бол хүлээн авна.
_VALID_REQUEST_ID = re.compile(r"[A-Za-z0-9._\-]{8,64}")

log = structlog.stdlib.get_logger("angel.access")


def get_request_id(scope: Scope) -> str | None:
    request_id = scope.get("state", {}).get("request_id")
    return request_id if isinstance(request_id, str) else None


class RequestContextMiddleware:
    """Request ID олгоно (зөв ирсэн ID байвал дахин ашиглана), log мөр бүрт холбож, хариунд буцааж,
    хүсэлт бүрт нэг access-log мөр бичнэ.

    Зориуд цэвэр ASGI: BaseHTTPMiddleware нь contextvars дамжуулалт, streaming-ийг эвддэг.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inbound = Headers(scope=scope).get(REQUEST_ID_HEADER)
        request_id = (
            inbound if inbound and _VALID_REQUEST_ID.fullmatch(inbound) else uuid.uuid4().hex
        )
        scope.setdefault("state", {})["request_id"] = request_id

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        status_code = 500
        started = time.perf_counter()

        async def send_with_request_id(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            log.info(
                "request",
                method=scope["method"],
                path=scope["path"],
                status=status_code,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
