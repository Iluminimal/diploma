"""Зургаар хайхад оруулсан зураг зөвшөөрөлгүйгээр хаана ч хадгалагдахгүй."""

from pathlib import Path

import pytest
from sqlalchemy import text

from tests.conftest import ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]


def files_under(root: Path) -> list[str]:
    return sorted(str(p.relative_to(root)) for p in root.rglob("*") if p.is_file())


async def row_counts(api_engine) -> dict[str, int]:  # type: ignore[no-untyped-def]
    queries = {
        "products": "SELECT count(*) FROM products",
        "users": "SELECT count(*) FROM users",
        "orders": "SELECT count(*) FROM orders",
        "reviews": "SELECT count(*) FROM reviews",
    }
    async with api_engine.connect() as connection:
        return {
            table: int((await connection.execute(text(query))).scalar_one())
            for table, query in queries.items()
        }


async def test_an_uploaded_search_photo_is_neither_written_to_disk_nor_to_the_database(
    api_factory: ApiFactory, tmp_path: Path
) -> None:
    async with api_factory(seed_count=3, media_dir=tmp_path) as api:
        files_before = files_under(tmp_path)
        rows_before = await row_counts(api.app.state.engine)
        photo = api.entries[0].jpeg

        image = await api.client.post(
            "/api/v1/search/image", files={"file": ("mine.jpg", photo, "image/jpeg")}
        )
        refined = await api.client.post(
            "/api/v1/search/image",
            files={"file": ("mine.jpg", photo, "image/jpeg")},
            data={"q": "blue"},
        )

        assert image.status_code == 200, image.text
        assert refined.status_code in (200, 422)  # шинэчлэлт нь нөхцөлт; хадгалалт нь гол асуудал
        assert files_under(tmp_path) == files_before
        assert await row_counts(api.app.state.engine) == rows_before
