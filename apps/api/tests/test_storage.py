from pathlib import Path

import pytest

from lookalike.storage import InvalidStorageKeyError, LocalStorage


def test_put_exists_and_url(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path / "media", "http://localhost:8000/media/")
    assert not storage.exists("products/001/1_400.webp")
    storage.put("products/001/1_400.webp", b"data")
    assert storage.exists("products/001/1_400.webp")
    assert (tmp_path / "media/products/001/1_400.webp").read_bytes() == b"data"
    assert (
        storage.url("products/001/1_400.webp")
        == "http://localhost:8000/media/products/001/1_400.webp"
    )


def test_put_overwrites_and_leaves_no_temp_files(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path, "/media")
    storage.put("a/b.webp", b"one")
    storage.put("a/b.webp", b"two")
    assert (tmp_path / "a/b.webp").read_bytes() == b"two"
    assert [p.name for p in (tmp_path / "a").iterdir()] == ["b.webp"]


@pytest.mark.parametrize(
    "key", ["../escape.webp", "a/../../escape.webp", "/etc/passwd", "", "a\\b.webp", "a/\0b"]
)
def test_unsafe_keys_are_rejected(tmp_path: Path, key: str) -> None:
    storage = LocalStorage(tmp_path / "media", "/media")
    with pytest.raises(InvalidStorageKeyError):
        storage.put(key, b"x")
    with pytest.raises(InvalidStorageKeyError):
        storage.exists(key)
    assert not (tmp_path / "escape.webp").exists()
