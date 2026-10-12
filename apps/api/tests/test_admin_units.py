import io

from PIL import Image
from starlette.types import ASGIApp, Scope

from angel.core.uploads import BodySizeLimitMiddleware
from angel.ingestion.images import THUMBNAIL_SIZES, build_thumbnails
from angel.repositories.patterns import contains_pattern, prefix_pattern


def test_thumbnails_cover_every_size_and_never_upscale() -> None:
    image = Image.new("RGB", (600, 900), (10, 20, 30))

    result = build_thumbnails(image)

    assert set(result.webp) == set(THUMBNAIL_SIZES)
    sizes = {s: Image.open(io.BytesIO(data)).size for s, data in result.webp.items()}
    assert sizes[800] == (533, 800)
    assert sizes[400][1] == 400
    assert abs(sizes[400][0] - 267) <= 1  # derived from the 800 px version, as in ingestion
    assert result.blur_data_url.startswith("data:image/webp;base64,")

    tiny = build_thumbnails(Image.new("RGB", (100, 150)))
    assert Image.open(io.BytesIO(tiny.webp[800])).size == (100, 150)


def test_like_patterns_treat_wildcards_literally() -> None:
    assert contains_pattern("50%_off\\") == "%50\\%\\_off\\\\%"
    assert prefix_pattern("LK_1") == "LK\\_1%"


def middleware() -> BodySizeLimitMiddleware:
    app: ASGIApp = None  # type: ignore[assignment]  # never called
    return BodySizeLimitMiddleware(app, max_file_bytes=1024, api_prefix="/api/v1")


def scope(method: str, path: str) -> Scope:
    return {"type": "http", "method": method, "path": path}


def test_the_size_limit_covers_the_admin_upload_endpoints() -> None:
    guard = middleware()

    assert guard._is_upload(scope("POST", "/api/v1/search/image"))
    assert guard._is_upload(scope("POST", "/api/v1/admin/products"))
    assert guard._is_upload(scope("PUT", "/api/v1/admin/products/17/image"))
    assert not guard._is_upload(scope("GET", "/api/v1/admin/products"))
    assert not guard._is_upload(scope("PUT", "/api/v1/admin/products/abc/image"))
    assert not guard._is_upload(scope("PUT", "/api/v1/admin/products/17"))
    assert not guard._is_upload(scope("POST", "/api/v1/auth/login"))
