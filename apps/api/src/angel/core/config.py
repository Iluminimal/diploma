from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    # API-г үргэлж apps/api-аас эхлүүлнэ (Makefile-ийг хар); repo-ийн үндсэн .env нь docker
    # compose-той хуваалцдаг, apps/api/.env нь заавал биш локал давхарлалт.
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["dev", "test", "prod"] = "dev"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    log_json: bool = True

    api_v1_prefix: str = "/api/v1"
    # Орчны хувьсагчид таслалаар тусгаарлана: CORS_ORIGINS=http://localhost:3000,https://shop.example
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    database_url: str = "postgresql+asyncpg://angel:angel@localhost:5433/angel"
    redis_url: str = "redis://localhost:6379/0"

    # Барааны зураг (thumbnail). LocalStorage эндээ бичнэ; API `media_url_path`-аар үйлчилнэ.
    # Харьцангуй зам нь apps/api-д (API үргэлж ажилладаг газар) тулгуурлана.
    media_dir: Path = Path("../../data/media")
    media_url_path: str = "/media"
    media_base_url: str = "http://localhost:8000/media"

    # FashionCLIP. `embedding_resize_mode` ба model revision нь embedding-ийн утгыг тодорхойлно:
    # аль нэгийг солбил каталогийг дахин embed хийх ёстой (ingest үүнийг илрүүлнэ).
    # `fake` нь CI-н end-to-end тестэд зориулсан тогтмол орлуулагч (model татахгүй); хувцасны
    # талаар юу ч мэдэхгүй тул production хүлээн авахгүй.
    embedder: Literal["fashion-clip", "fake"] = "fashion-clip"
    embedding_device: Literal["auto", "mps", "cpu", "cuda"] = "auto"
    embedding_fp16: bool = False
    embedding_resize_mode: Literal["crop", "pad"] = "pad"

    # --- хайлт ----------------------------------------------------------------------------
    # Upload: хэмжээ, зарласан төрөл, жинхэнэ формат, pixel тоогоор шалгана (decompression bomb).
    max_upload_bytes: int = 8 * 1024 * 1024
    max_upload_pixels: int = 25_000_000
    # Клиент `limit` зааж өгөөгүй үед буцаах үр дүнгийн тоо.
    search_default_limit: int = 24
    # Hybrid хайлт дахь текст embedding-ийн жин (зураг 1 - жин авна). docs/search-api.md-д
    # хэмжсэн: 0.5 өнгийг бараг өөрчилдөггүй, ~0.75-аас дээш бол хувцасны төрөл алдагдана.
    hybrid_text_weight: float = 0.65
    # Зургаар хайхад хэдэн zero-shot ангиллын таамаг буцаах вэ.
    detected_categories: int = 3

    # Redis cache. Embedding version нь key бүрийн нэг хэсэг тул дахин embed хийхэд хүчингүй болно.
    text_embedding_cache_ttl_seconds: int = 24 * 3600
    similar_cache_ttl_seconds: int = 300
    catalog_filters_cache_ttl_seconds: int = 600

    # Rate limit: клиент бүрт "<хүсэлтийн тоо>/<цонхны секунд>", тогтмол цонх, Redis-д.
    rate_limit_enabled: bool = True
    rate_limit_prefix: str = "rl"
    rate_limit_image: str = "20/60"
    rate_limit_text: str = "60/60"
    rate_limit_similar: str = "120/60"
    # Итгэмжлэгдсэн reverse proxy-ийн ард клиентийн хаяг нь X-Forwarded-For-ийн эхний утга.
    trust_proxy_headers: bool = False

    # --- нэвтрэлт -------------------------------------------------------------------------
    # Access token-ы HS256 гарын үсгийн түлхүүр. Prod-д заавал (>= 32 тэмдэгт); бусад үед хоосон
    # бол процесс бүрт шинээр үүсгэнэ, restart хийхэд хүн бүр гарна.
    jwt_secret: str = ""
    access_token_ttl_seconds: int = 15 * 60
    refresh_token_ttl_days: int = 30
    # Refresh, guest-cart cookie. Prod-д Secure заавал асна; dev энгийн http дээр ажиллана.
    cookie_secure: bool = False
    rate_limit_register: str = "5/3600"
    rate_limit_login: str = "10/300"
    rate_limit_login_email: str = "5/300"
    rate_limit_refresh: str = "60/60"
    rate_limit_admin: str = "120/60"
    rate_limit_oauth: str = "30/300"
    rate_limit_review: str = "20/3600"
    # Нэг удаагийн код авах/оруулах оролдлого, клиентийн хаяг тутамд. Утасны дугаар, email тутмын
    # хязгаар нь `otp_resend_seconds`, `otp_max_sends_per_hour`, `otp_max_attempts`.
    rate_limit_otp_send: str = "10/600"
    rate_limit_otp_verify: str = "30/600"

    # --- нэг удаагийн код (утас/email-ээр нэвтрэх, баталгаажуулах, солих, нууц үг сэргээх) -
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    otp_resend_seconds: int = 60
    otp_max_sends_per_hour: int = 5
    # End-to-end тест, demo-д зориулсан тогтмол код: challenge бүр энэ кодтой болно. Prod хүлээн
    # авахгүй. Хоосон бол санамсаргүй код.
    otp_dev_code: str = ""
    # Улсын кодгүй бичсэн дугаарыг энэ бүс (ISO 3166 alpha-2)-ээр тайлна.
    default_phone_region: str = "US"
    # `console`: SMS-г API log-д бичнэ (хөгжүүлэлт). `twilio`: Twilio-оор илгээнэ.
    sms_mode: Literal["console", "twilio"] = "console"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # --- Google-ээр нэвтрэх ---------------------------------------------------------------
    # `google`: жинхэнэ урсгал (client id, secret хэрэгтэй). `fake`: `login_hint`-ээр заасан хүнийг
    # нэвтрүүлдэг процесс доторх орлуулагч, тест/CI-д; prod хүлээн авахгүй.
    oauth_mode: Literal["google", "fake"] = "google"
    google_client_id: str = ""
    google_client_secret: str = ""
    # Google console-д бүртгэсэн. Вэб origin дээр байгаа (Next /api/v1-г API руу proxy хийнэ) тул
    # callback-ийн тавьсан session cookie first-party болно.
    google_redirect_uri: str = "http://localhost:3000/api/v1/auth/google/callback"
    # Callback дараа нь browser-ийг хаана илгээх вэ (амжилтгүй бол /login руу).
    web_base_url: str = "http://localhost:3000"

    # --- сагс ба checkout -----------------------------------------------------------------
    cart_max_quantity: int = 10
    cart_max_lines: int = 50
    cart_guest_ttl_days: int = 30
    currency: str = "USD"
    shipping_standard_cents: int = 499
    shipping_express_cents: int = 1299
    # Энэ дүнгээс дээш бол энгийн хүргэлт үнэгүй.
    free_shipping_threshold_cents: int = 10_000
    # Захиалга үүсэхэд нөөцийг нөөцөлнэ; төлөгдөөгүй захиалга энэ хугацааны дараа нөөцийг буцаана.
    order_pending_ttl_minutes: int = 30
    order_sweep_interval_seconds: int = 60
    # Энэ тоо ба түүнээс доош ширхэгтэй бараа "нөөц багатай" гэж тооцогдоно (dashboard, inventory).
    low_stock_threshold: int = 5

    # --- төлбөр ---------------------------------------------------------------------------
    # `stripe`: жинхэнэ PaymentIntent (dev-д test key). `offline`: Stripe key-гүйгээр бүх урсгалыг
    # турших процесс доторх gateway; prod хүлээн авахгүй.
    payments_mode: Literal["stripe", "offline"] = "stripe"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Kaggle dataset-ийн байрлал (styles.csv + images/). Зөвхөн ingestion-д хэрэгтэй.
    dataset_dir: Path | None = None

    # /readyz дахь нэг dependency шалгалтын дээд хугацаа.
    readiness_timeout_seconds: float = 2.0
    # Cache, rate-limit дуудлага хурдан бууж өгнө: удаан Redis хайлтыг удаашруулж болохгүй.
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

    @field_validator("otp_dev_code")
    @classmethod
    def _dev_code_shape(cls, value: str) -> str:
        if value and not (len(value) == 6 and value.isdigit()):
            raise ValueError("OTP_DEV_CODE must be six digits")
        return value

    @field_validator("default_phone_region")
    @classmethod
    def _region_shape(cls, value: str) -> str:
        if len(value) != 2 or not value.isalpha():
            raise ValueError("DEFAULT_PHONE_REGION must be a two-letter country code")
        return value.upper()

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
            if self.otp_dev_code:
                raise ValueError("OTP_DEV_CODE is not allowed when APP_ENV=prod")
            if self.sms_mode != "twilio":
                raise ValueError("SMS_MODE=console is not allowed when APP_ENV=prod")
            if not (self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number):
                raise ValueError(
                    "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are required "
                    "when SMS_MODE=twilio"
                )
            if not (self.stripe_secret_key and self.stripe_webhook_secret):
                raise ValueError("STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required in prod")
            self.cookie_secure = True
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
