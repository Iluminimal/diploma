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

    # --- search ---------------------------------------------------------------------------
    # Uploads: validated by size, declared type, real format and pixel count (decompression bombs).
    max_upload_bytes: int = 8 * 1024 * 1024
    max_upload_pixels: int = 25_000_000
    # Number of results when the client does not ask for a specific `limit`.
    search_default_limit: int = 24
    # Weight of the text embedding in hybrid search (the image gets 1 - weight). Measured in
    # docs/search-api.md: 0.5 barely changes colour, above ~0.75 the garment type gets lost.
    hybrid_text_weight: float = 0.65
    # How many zero-shot category predictions are returned with an image search.
    detected_categories: int = 3

    # Redis caches. The embedding version is part of every key, so a re-embed invalidates them.
    text_embedding_cache_ttl_seconds: int = 24 * 3600
    similar_cache_ttl_seconds: int = 300
    catalog_filters_cache_ttl_seconds: int = 600

    # Rate limits: "<requests>/<window seconds>" per client, fixed window, in Redis.
    rate_limit_enabled: bool = True
    rate_limit_prefix: str = "rl"
    rate_limit_image: str = "20/60"
    rate_limit_text: str = "60/60"
    rate_limit_similar: str = "120/60"
    # Behind a trusted reverse proxy the client address is the first X-Forwarded-For entry.
    trust_proxy_headers: bool = False

    # Where the Kaggle dataset lives (styles.csv + images/). Only ingestion needs it.
    dataset_dir: Path | None = None

    # Upper bound for a single dependency probe in /readyz.
    readiness_timeout_seconds: float = 2.0
    # Cache and rate-limit calls give up quickly: a slow Redis must not slow searches down.
    redis_op_timeout_seconds: float = 0.5

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
