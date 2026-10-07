import pytest

from lookalike.core.config import Settings


def test_cors_origins_are_split_on_commas(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:3000, https://shop.example ,")
    assert Settings().cors_origins == ["http://localhost:3000", "https://shop.example"]


def test_invalid_log_level_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", "LOUD")
    with pytest.raises(ValueError, match="log_level"):
        Settings()
