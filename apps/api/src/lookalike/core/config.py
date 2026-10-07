from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    # The API is always started from apps/api (see Makefile); the repo-root .env is shared
    # with docker compose, apps/api/.env is an optional local override.
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["dev", "test", "prod"] = "dev"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    api_v1_prefix: str = "/api/v1"
    # Comma-separated in the environment: CORS_ORIGINS=http://localhost:3000,https://shop.example
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    database_url: str = "postgresql+asyncpg://lookalike:lookalike@localhost:5433/lookalike"
    redis_url: str = "redis://localhost:6379/0"

    # Product images (thumbnails). LocalStorage writes here; the API serves it at
    # `media_url_path`. Relative paths resolve against apps/api (where the API always runs).
    media_dir: Path = Path("../../data/media")
    media_url_path: str = "/media"
    media_base_url: str = "http://localhost:8000/media"

    # FashionCLIP. `embedding_resize_mode` and the model revision define what an embedding
    # means: changing either requires re-embedding the catalogue (ingest detects this).
    embedding_device: Literal["auto", "mps", "cpu", "cuda"] = "auto"
    embedding_fp16: bool = False
    embedding_resize_mode: Literal["crop", "pad"] = "pad"

    # Where the Kaggle dataset lives (styles.csv + images/). Only ingestion needs it.
    dataset_dir: Path | None = None

    # Upper bound for a single dependency probe in /readyz.
    readiness_timeout_seconds: float = 2.0

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
