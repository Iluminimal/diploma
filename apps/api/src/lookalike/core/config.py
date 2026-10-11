from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
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
    # `fake` is a deterministic stand-in for the end-to-end tests in CI (no model download); it
    # knows nothing about clothes, so production refuses it.
    embedder: Literal["fashion-clip", "fake"] = "fashion-clip"
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

    # --- auth -----------------------------------------------------------------------------
    # HS256 signing key for access tokens. Required (>= 32 chars) in prod; elsewhere an empty
    # value means "generate one per process", which logs everyone out on restart.
    jwt_secret: str = ""
    access_token_ttl_seconds: int = 15 * 60
    refresh_token_ttl_days: int = 30
    # Refresh and guest-cart cookies. Secure is forced on in prod; dev runs on plain http.
    cookie_secure: bool = False
    rate_limit_register: str = "5/3600"
    rate_limit_login: str = "10/300"
    rate_limit_login_email: str = "5/300"
    rate_limit_refresh: str = "60/60"
    rate_limit_admin: str = "120/60"
    rate_limit_oauth: str = "30/300"

    # --- sign in with Google --------------------------------------------------------------
    # `google`: the real flow (needs the client id and secret). `fake`: an in-process stand-in
    # that signs in whoever `login_hint` names, for tests and CI; refused in prod.
    oauth_mode: Literal["google", "fake"] = "google"
    google_client_id: str = ""
    google_client_secret: str = ""
    # Registered in the Google console. It is on the web origin (Next proxies /api/v1 to the API)
    # so the session cookies the callback sets are first-party.
    google_redirect_uri: str = "http://localhost:3000/api/v1/auth/google/callback"
    # Where the callback sends the browser afterwards (and on failure, to /login).
    web_base_url: str = "http://localhost:3000"

    # --- cart and checkout ----------------------------------------------------------------
    cart_max_quantity: int = 10
    cart_max_lines: int = 50
    cart_guest_ttl_days: int = 30
    currency: str = "USD"
    shipping_standard_cents: int = 499
    shipping_express_cents: int = 1299
    # Standard shipping is free from this subtotal.
    free_shipping_threshold_cents: int = 10_000
    # Stock is reserved when an order is created; unpaid orders give it back after this long.
    order_pending_ttl_minutes: int = 30
    order_sweep_interval_seconds: int = 60

    # --- payments -------------------------------------------------------------------------
    # `stripe`: real PaymentIntents (test keys in dev). `offline`: an in-process gateway so the
    # whole flow can be exercised without Stripe keys; refused in prod.
    payments_mode: Literal["stripe", "offline"] = "stripe"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Where the Kaggle dataset lives (styles.csv + images/). Only ingestion needs it.
    dataset_dir: Path | None = None

    # Upper bound for a single dependency probe in /readyz.
    readiness_timeout_seconds: float = 2.0
    # Cache and rate-limit calls give up quickly: a slow Redis must not slow searches down.
    redis_op_timeout_seconds: float = 0.5

    @property
    def google_enabled(self) -> bool:
        return self.oauth_mode == "fake" or bool(
            self.google_client_id and self.google_client_secret
        )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _check_production(self) -> "Settings":
        if self.jwt_secret and len(self.jwt_secret) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        if self.app_env == "prod":
            if not self.jwt_secret:
                raise ValueError("JWT_SECRET is required when APP_ENV=prod")
            if self.embedder != "fashion-clip":
                raise ValueError("EMBEDDER=fake is not allowed when APP_ENV=prod")
            if self.payments_mode != "stripe":
                raise ValueError("PAYMENTS_MODE=offline is not allowed when APP_ENV=prod")
            if self.oauth_mode != "google":
                raise ValueError("OAUTH_MODE=fake is not allowed when APP_ENV=prod")
            if not (self.stripe_secret_key and self.stripe_webhook_secret):
                raise ValueError("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in prod")
            self.cookie_secure = True
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
