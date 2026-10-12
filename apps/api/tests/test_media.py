from pathlib import Path

from angel.core.config import Settings

from .helpers import running_app


async def test_media_files_are_served_with_cache_headers(
    settings: Settings, tmp_path: Path
) -> None:
    (tmp_path / "products" / "001").mkdir(parents=True)
    (tmp_path / "products" / "001" / "1_400.webp").write_bytes(b"RIFFwebp")
    app_settings = settings.model_copy(update={"media_dir": tmp_path})

    async with running_app(app_settings) as (client, _):
        found = await client.get("/media/products/001/1_400.webp")
        missing = await client.get("/media/products/001/2_400.webp")
        escape = await client.get("/media/../secret.txt")

    assert found.status_code == 200
    assert found.content == b"RIFFwebp"
    assert found.headers["cache-control"] == "public, max-age=86400"
    assert missing.status_code == 404
    assert escape.status_code in (400, 404)


async def test_missing_media_directory_does_not_break_startup(
    settings: Settings, tmp_path: Path
) -> None:
    app_settings = settings.model_copy(update={"media_dir": tmp_path / "does-not-exist"})
    async with running_app(app_settings) as (client, _):
        response = await client.get("/media/products/001/1_400.webp")
    assert response.status_code == 404
