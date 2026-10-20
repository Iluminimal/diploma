"""Upload-ийн хамгаалалт: задлахаас өмнө шалгаж болох бүхнийг шалгана.

Клиентийн хэлсэн зүйлд итгэхгүй: зарласан төрөл нь зөвхөн эхний шүүлтүүр (415), жинхэнэ формат
decode хийхдээ byte-аас тогтоогдоно (`load_image(formats=...)`), хэмжээг body ирэх явцад тоолно,
тиймээс Content-Length худлаа байсан ч, chunked encoding ч хязгаараас гарч чадахгүй.
"""

import re
from http import HTTPStatus

from fastapi import UploadFile
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from angel.core.errors import ProblemError, problem_response
from angel.schemas.problem import ProblemDetail

ALLOWED_CONTENT_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})
# Дээрх content type-д харгалзах Pillow-ийн формат нэр.
ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP")
UPLOAD_PATHS = ("/search/image", "/search/hybrid", "/admin/products")
_ADMIN_IMAGE_PATH = re.compile(r"^/admin/products/\d+/image$")
# Multipart хүрээ болон файлтай хамт ирэх жижиг form талбарууд.
_FORM_OVERHEAD_BYTES = 64 * 1024

TOO_LARGE_TYPE = "urn:angel:problem:upload-too-large"
UNSUPPORTED_TYPE = "urn:angel:problem:unsupported-media-type"
INVALID_IMAGE_TYPE = "urn:angel:problem:invalid-image"


class UploadTooLargeError(ProblemError):
    def __init__(self, max_bytes: int) -> None:
        super().__init__(
            HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
            "Image too large",
            f"The image must be at most {max_bytes // (1024 * 1024)} MB.",
            type_=TOO_LARGE_TYPE,
            extensions={"max_bytes": max_bytes},
        )


def invalid_image(detail: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.UNPROCESSABLE_ENTITY, "Invalid image", detail, type_=INVALID_IMAGE_TYPE
    )


async def read_image_upload(file: UploadFile, max_bytes: int) -> bytes:
    """Зарласан төрөл, хэмжээг шалгасны дараах upload-ийн byte. Хоосон body хэзээ ч буцаахгүй."""
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ProblemError(
            HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            "Unsupported image type",
            "Upload a JPEG, PNG or WebP image.",
            type_=UNSUPPORTED_TYPE,
            extensions={"allowed": sorted(ALLOWED_CONTENT_TYPES)},
        )
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise UploadTooLargeError(max_bytes)
    if not data:
        raise invalid_image("The uploaded file is empty.")
    return data


class BodySizeLimitMiddleware:
    """Хэт том upload хүсэлтийг уншихаас өмнө (Content-Length) эсвэл унших явцад (stream)
    татгалзана, ингэснээр клиент server-ийг хязгааргүй хэмжээний өгөгдөл buffer хийлгэж чадахгүй."""

    def __init__(self, app: ASGIApp, *, max_file_bytes: int, api_prefix: str) -> None:
        self.app = app
        self.limit = max_file_bytes + _FORM_OVERHEAD_BYTES
        self.max_file_bytes = max_file_bytes
        self.api_prefix = api_prefix
        self.paths = tuple(f"{api_prefix}{path}" for path in UPLOAD_PATHS)

    def _is_upload(self, scope: Scope) -> bool:
        path: str = scope["path"]
        if scope["method"] == "POST" and path in self.paths:
            return True
        # PUT /admin/products/{id}/image барааны зургийг солино.
        return scope["method"] == "PUT" and bool(
            _ADMIN_IMAGE_PATH.match(path.removeprefix(self.api_prefix))
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self._is_upload(scope):
            await self.app(scope, receive, send)
            return

        declared = _content_length(scope)
        if declared is not None and declared > self.limit:
            problem = ProblemDetail(
                type=TOO_LARGE_TYPE,
                title="Image too large",
                status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                detail=f"The image must be at most {self.max_file_bytes // (1024 * 1024)} MB.",
                max_bytes=self.max_file_bytes,
            )
            await problem_response(Request(scope), problem)(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    raise UploadTooLargeError(self.max_file_bytes)
            return message

        await self.app(scope, limited_receive, send)


def _content_length(scope: Scope) -> int | None:
    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None
