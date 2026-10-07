from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope


class MediaFiles(StaticFiles):
    """Static files for product images: browsers and CDNs may cache them for a day.

    Only used in development; production serves the same keys from object storage/CDN.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=86400"
        return response
