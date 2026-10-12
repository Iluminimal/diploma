"""Object storage abstraction: local disk in development; an S3-compatible backend is added
with deployment (it cannot be exercised before then)."""

import os
import tempfile
from pathlib import Path, PurePosixPath
from typing import Protocol


class Storage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def exists(self, key: str) -> bool: ...

    def delete(self, key: str) -> None: ...

    def url(self, key: str) -> str: ...


class InvalidStorageKeyError(ValueError):
    pass


class LocalStorage:
    def __init__(self, root: Path, base_url: str) -> None:
        self.root = root.resolve()
        self.base_url = base_url.rstrip("/")

    def put(self, key: str, data: bytes) -> None:
        """Write atomically: readers (and resumed runs) never see a half-written file."""
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(tmp_name, path)
        except BaseException:
            Path(tmp_name).unlink(missing_ok=True)
            raise

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def delete(self, key: str) -> None:
        """Removing a file that is not there is fine: cleanup must be safe to repeat."""
        self._path(key).unlink(missing_ok=True)

    def url(self, key: str) -> str:
        self._path(key)
        return f"{self.base_url}/{key}"

    def _path(self, key: str) -> Path:
        pure = PurePosixPath(key)
        if not key or "\\" in key or "\0" in key or pure.is_absolute() or ".." in pure.parts:
            raise InvalidStorageKeyError(f"invalid storage key: {key!r}")
        path = (self.root / pure).resolve()
        if not path.is_relative_to(self.root):
            raise InvalidStorageKeyError(f"invalid storage key: {key!r}")
        return path
