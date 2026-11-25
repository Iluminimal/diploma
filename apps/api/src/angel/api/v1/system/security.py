"""Browser-ийн Content-Security-Policy зөрчлийн мэдээлэл хүлээн авах. Нэвтрэлтгүй (browser өөрөө
илгээдэг), тиймээс: бие нь жижиг, rate limit-тэй, юу ч хадгалахгүй, зөвхөн log-д хураангуй бичнэ."""

import json
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Request, Response

from angel.core.errors import ProblemError
from angel.core.logging import get_logger
from angel.core.rate_limit import rate_limit

log = get_logger(__name__)
router = APIRouter(prefix="/security", tags=["security"])

MAX_REPORT_BYTES = 8 * 1024
MAX_FIELD = 200


def _clip(value: object) -> str | None:
    """Log-д аюулгүй текст: URL-ийн query, fragment (token агуулж болно)-ийг хасаж, богиносгоно."""
    if value is None or value == "":
        return None
    text = str(value)
    if "://" in text:
        parts = urlsplit(text)
        text = f"{parts.scheme}://{parts.netloc}{parts.path}"
    return text[:MAX_FIELD]


def _summaries(payload: Any) -> list[dict[str, str | int | None]]:
    """Хоёр хэлбэрийг хүлээнэ: хуучин `{"csp-report": {...}}` ба Reporting API-ийн
    `[{"type": "csp-violation", "body": {...}}]`."""
    bodies: list[dict[str, Any]] = []
    if isinstance(payload, dict) and isinstance(payload.get("csp-report"), dict):
        bodies.append(payload["csp-report"])
    elif isinstance(payload, list):
        for item in payload[:10]:
            if isinstance(item, dict) and isinstance(item.get("body"), dict):
                bodies.append(item["body"])
    summaries: list[dict[str, str | int | None]] = []
    for body in bodies:
        line = body.get("line-number", body.get("lineNumber"))
        summaries.append(
            {
                "directive": _clip(body.get("violated-directive", body.get("effectiveDirective"))),
                "blocked": _clip(body.get("blocked-uri", body.get("blockedURL"))),
                "document": _clip(body.get("document-uri", body.get("documentURL"))),
                "source": _clip(body.get("source-file", body.get("sourceFile"))),
                "line": line if isinstance(line, int) else None,
            }
        )
    return summaries


@router.post(
    "/csp-report",
    status_code=204,
    summary="Receive a browser's Content-Security-Policy violation report",
    dependencies=[Depends(rate_limit("csp_report"))],
    include_in_schema=False,
)
async def csp_report(request: Request) -> Response:
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_REPORT_BYTES:
        raise ProblemError(413, "Мэдээлэл хэт том байна")
    body = b""
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_REPORT_BYTES:
            raise ProblemError(413, "Мэдээлэл хэт том байна")
    try:
        payload = json.loads(body)
    except ValueError:
        # Эвдэрхий мэдээллийг чимээгүй хаяна: browser дахин илгээхгүй, алдаа харуулах хэрэггүй.
        return Response(status_code=204)
    for summary in _summaries(payload):
        log.warning("csp_violation", **summary)
    return Response(status_code=204)
