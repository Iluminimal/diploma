from collections.abc import AsyncIterator, Awaitable, Callable
from http import HTTPStatus
from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from angel.core.config import Settings
from angel.core.cookies import CART_COOKIE, set_cart_cookie
from angel.core.errors import (
    FORBIDDEN_TYPE,
    PAYMENTS_UNAVAILABLE_TYPE,
    UNAUTHENTICATED_TYPE,
    ProblemError,
)
from angel.core.mail import BestEffortMailer, Mailer
from angel.core.rate_limit import RateLimiter, client_address
from angel.core.security import decode_access_token, new_opaque_token
from angel.core.sms import SmsSender
from angel.ml.classifier import LazyCategoryClassifier
from angel.ml.embeddings import EmbeddingService
from angel.ml.localizer import GarmentLocalizer
from angel.models import User
from angel.models.user import ROLE_ADMIN, ROLE_WAREHOUSE, STAFF_ROLES
from angel.oauth import OAuthProvider
from angel.payments import PaymentGateway
from angel.repositories.accounts.users import UserRepository
from angel.repositories.system.health import HealthRepository
from angel.services.accounts.account import AccountService
from angel.services.accounts.addresses import AddressService
from angel.services.accounts.auth import AuthService, ClientInfo
from angel.services.accounts.oauth import OAuthService
from angel.services.accounts.otp import OtpService
from angel.services.accounts.otp_login import OtpLoginService
from angel.services.accounts.password_reset import PasswordResetService
from angel.services.admin.audit import AdminAuditService
from angel.services.admin.dashboard import AdminDashboardService
from angel.services.admin.fulfillment import FulfillmentBoardService
from angel.services.admin.orders import AdminOrderService
from angel.services.admin.products import AdminProductService
from angel.services.cache import SearchCache
from angel.services.catalog.catalog import CatalogService
from angel.services.catalog.search import SearchService
from angel.services.commerce.cart import CartOwner, CartService
from angel.services.commerce.checkout import CheckoutService
from angel.services.commerce.order_fulfillment import OrderFulfillmentService
from angel.services.commerce.orders import OrderService
from angel.services.commerce.payments import PaymentSettlement
from angel.services.commerce.webhooks import WebhookService
from angel.services.commerce.wishlist import WishlistService
from angel.services.reviews.reviews import ReviewService
from angel.services.system.health import HealthService
from angel.storage import Storage


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_engine(request: Request) -> AsyncEngine:
    engine: AsyncEngine = request.app.state.engine
    return engine


def get_redis(request: Request) -> Redis:
    redis: Redis = request.app.state.redis
    return redis


def get_embedding_service(request: Request) -> EmbeddingService | None:
    embeddings: EmbeddingService | None = request.app.state.embedding_service
    return embeddings


SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    sessions: async_sessionmaker[AsyncSession] = request.app.state.sessions
    async with sessions() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_storage(request: Request) -> Storage:
    storage: Storage = request.app.state.storage
    return storage


StorageDep = Annotated[Storage, Depends(get_storage)]


def get_health_service(
    settings: SettingsDep,
    engine: Annotated[AsyncEngine, Depends(get_engine)],
    redis: Annotated[Redis, Depends(get_redis)],
    embeddings: Annotated[EmbeddingService | None, Depends(get_embedding_service)],
) -> HealthService:
    repository = HealthRepository(engine, redis, settings.readiness_timeout_seconds)
    return HealthService(repository, embeddings)


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]


def get_search_service(
    request: Request,
    settings: SettingsDep,
    session: SessionDep,
    storage: StorageDep,
) -> SearchService:
    embedder: EmbeddingService | None = request.app.state.embedding_service
    if embedder is None or not embedder.is_loaded():
        raise ProblemError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "Хайлт боломжгүй",
            "Загвар хараахан ачаалагдаагүй байна.",
        )
    classifier: LazyCategoryClassifier = request.app.state.classifier
    localizer: GarmentLocalizer = request.app.state.localizer
    cache: SearchCache = request.app.state.search_cache
    return SearchService(
        session=session,
        embedder=embedder,
        classifier=classifier,
        localizer=localizer,
        cache=cache,
        storage=storage,
        max_upload_pixels=settings.max_upload_pixels,
        default_limit=settings.search_default_limit,
        hybrid_text_weight=settings.hybrid_text_weight,
        detected_categories=settings.detected_categories,
    )


SearchServiceDep = Annotated[SearchService, Depends(get_search_service)]


def get_admin_product_service(
    request: Request, settings: SettingsDep, session: SessionDep, storage: StorageDep
) -> AdminProductService:
    embedder: EmbeddingService | None = request.app.state.embedding_service
    if embedder is None or not embedder.is_loaded():
        raise ProblemError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "Загвар боломжгүй",
            "Загвар хараахан ачаалагдаагүй байна.",
        )
    cache: SearchCache = request.app.state.search_cache
    return AdminProductService(
        session,
        storage,
        embedder,
        cache,
        currency=settings.currency,
        max_upload_pixels=settings.max_upload_pixels,
        low_stock_threshold=settings.low_stock_threshold,
    )


AdminProductServiceDep = Annotated[AdminProductService, Depends(get_admin_product_service)]


def get_admin_dashboard_service(
    session: SessionDep, storage: StorageDep, settings: SettingsDep
) -> AdminDashboardService:
    return AdminDashboardService(session, storage, settings)


AdminDashboardServiceDep = Annotated[AdminDashboardService, Depends(get_admin_dashboard_service)]


def get_admin_audit_service(session: SessionDep) -> AdminAuditService:
    return AdminAuditService(session)


AdminAuditServiceDep = Annotated[AdminAuditService, Depends(get_admin_audit_service)]


def get_fulfillment_board_service(
    session: SessionDep, storage: StorageDep, settings: SettingsDep
) -> FulfillmentBoardService:
    return FulfillmentBoardService(session, storage, settings)


FulfillmentBoardServiceDep = Annotated[
    FulfillmentBoardService, Depends(get_fulfillment_board_service)
]


def get_admin_order_service(session: SessionDep, storage: StorageDep) -> AdminOrderService:
    return AdminOrderService(session, storage)


AdminOrderServiceDep = Annotated[AdminOrderService, Depends(get_admin_order_service)]


def get_review_service(request: Request, session: SessionDep, storage: StorageDep) -> ReviewService:
    cache: SearchCache = request.app.state.search_cache
    return ReviewService(session, storage, cache)


ReviewServiceDep = Annotated[ReviewService, Depends(get_review_service)]


def get_catalog_service(
    request: Request, session: SessionDep, storage: StorageDep
) -> CatalogService:
    cache: SearchCache = request.app.state.search_cache
    return CatalogService(session, storage, cache)


CatalogServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]


# --- нэвтрэлт ---------------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False, description="Access token from /auth/login or /auth/refresh")
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthenticated(detail: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.UNAUTHORIZED,
        "Нэвтрээгүй байна",
        detail,
        type_=UNAUTHENTICATED_TYPE,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_optional_user_id(request: Request, credentials: BearerDep) -> int | None:
    """Нэвтэрсэн хэрэглэгчийн id, зочин бол None. Token байгаа ч буруу/хугацаа дууссан бол 401,
    "зочин" гэж чимээгүй тооцохгүй: клиент refresh хийх ёстой, сагсаа алдах ёсгүй."""
    if credentials is None:
        return None
    user_id = decode_access_token(credentials.credentials, request.app.state.jwt_secret)
    if user_id is None:
        raise _unauthenticated("Нэвтрэлтийн хугацаа дууссан байна.")
    return user_id


def get_current_user_id(user_id: Annotated[int | None, Depends(get_optional_user_id)]) -> int:
    if user_id is None:
        raise _unauthenticated("Үргэлжлүүлэхийн тулд нэвтэрнэ үү.")
    return user_id


OptionalUserDep = Annotated[int | None, Depends(get_optional_user_id)]
CurrentUserDep = Annotated[int, Depends(get_current_user_id)]


def require_roles(*roles: str, title: str, detail: str) -> Callable[..., Awaitable[User]]:
    """Заасан role-той нэвтэрсэн хэрэглэгчийг шаардах dependency үүсгэнэ. Role-ийг хүсэлт бүрт
    database-аас уншдаг (token-д байхгүй) тул эрхийг хураах, хэрэглэгчийг идэвхгүй болгох нь тэр
    дороо хүчинтэй болно."""

    async def dependency(user_id: CurrentUserDep, session: SessionDep) -> User:
        async with session.begin():
            user = await UserRepository(session).get(user_id)
            if user is None or not user.is_active:
                raise _unauthenticated("Дахин нэвтэрнэ үү.")
            if user.role not in roles:
                raise ProblemError(HTTPStatus.FORBIDDEN, title, detail, type_=FORBIDDEN_TYPE)
        return user

    return dependency


# Админ: хэрэглэгч, сэтгэгдэл, статистик, захиалгын цуцлалт/буцаалт.
get_current_admin = require_roles(
    ROLE_ADMIN,
    title="Зөвхөн админ",
    detail="Таны бүртгэл энэ үйлдлийг хийх эрхгүй байна: зөвхөн админ хийнэ.",
)
# Агуулахын ажилтан: бараа, нөөц, захиалгын ачилт (ship/deliver).
get_current_warehouse = require_roles(
    ROLE_WAREHOUSE,
    title="Зөвхөн агуулахын ажилтан",
    detail="Таны бүртгэл энэ үйлдлийг хийх эрхгүй байна: зөвхөн агуулахын ажилтан хийнэ.",
)
# Аль ч ажилтан: админ самбарын нэвтрэх хаалга ба зөвхөн харах (read-only) endpoint-ууд.
get_current_staff = require_roles(
    *STAFF_ROLES,
    title="Зөвхөн ажилтан",
    detail="Таны бүртгэл админ хэсэг ашиглах эрхгүй байна.",
)

AdminDep = Annotated[User, Depends(get_current_admin)]
WarehouseDep = Annotated[User, Depends(get_current_warehouse)]
StaffDep = Annotated[User, Depends(get_current_staff)]


async def forbid_staff_shopping(user_id: OptionalUserDep, session: SessionDep) -> None:
    """Админ, агуулахын ажилтан бол back-office-ийн хэрэглэгч: сагс өөрчлөх, захиалга өгөх эрхгүй.
    Зочин болон энгийн хэрэглэгчид нөлөөлөхгүй. Role-ийг `require_roles`-тай адил DB-ээс уншина."""
    if user_id is None:
        return
    async with session.begin():
        user = await UserRepository(session).get(user_id)
    if user is not None and user.is_staff:
        raise ProblemError(
            HTTPStatus.FORBIDDEN,
            "Ажилтан худалдан авалт хийх боломжгүй",
            "Ажилтны бүртгэлээр сагс болон захиалга ашиглах боломжгүй. Худалдан авахдаа "
            "хэрэглэгчийн бүртгэлээр нэвтэрнэ үү.",
            type_=FORBIDDEN_TYPE,
        )


ShoppingGuard = Annotated[None, Depends(forbid_staff_shopping)]


def get_cart_owner(request: Request, user_id: OptionalUserDep) -> CartOwner:
    """Энэ хүсэлт хэний сагсыг уншихыг тодорхойлно: хэрэглэгчийнх, үгүй бол зочны cookie-ийнх
    (байхгүй байж болно)."""
    return CartOwner(user_id=user_id, guest_token=request.cookies.get(CART_COOKIE))


def get_cart_writer(
    request: Request,
    response: Response,
    settings: SettingsDep,
    user_id: OptionalUserDep,
    _guard: ShoppingGuard,
) -> CartOwner:
    """`get_cart_owner`-тэй адил, гэхдээ анх удаа ирсэн зочинд сагсны cookie өгнө. Ажилтан сагс
    өөрчилж болохгүй (`forbid_staff_shopping`)."""
    token = request.cookies.get(CART_COOKIE)
    if user_id is None and not token:
        token = new_opaque_token()
        set_cart_cookie(response, settings, token)
    return CartOwner(user_id=user_id, guest_token=token)


CartOwnerDep = Annotated[CartOwner, Depends(get_cart_owner)]
CartWriterDep = Annotated[CartOwner, Depends(get_cart_writer)]


def no_store(response: Response) -> None:
    """Хувийн мэдээлэл хуваалцсан cache-д хэзээ ч үлдэж болохгүй."""
    response.headers["Cache-Control"] = "no-store"


# --- commerce service-үүд ---------------------------------------------------------------------


def get_strict_mailer(request: Request) -> Mailer:
    """Алдааг шиднэ: нэг удаагийн код хүргэгдээгүй бол хэрэглэгч мэдэх ёстой (503)."""
    mailer: Mailer = request.app.state.mailer
    return mailer


def get_mailer(request: Request) -> Mailer:
    """Мэдэгдлийн имэйл: SMTP унасан ч commit хийгдсэн хүсэлт амжилттай үлдэнэ."""
    return BestEffortMailer(get_strict_mailer(request))


def get_payment_gateway(request: Request) -> PaymentGateway | None:
    gateway: PaymentGateway | None = request.app.state.payment_gateway
    return gateway


GatewayDep = Annotated[PaymentGateway | None, Depends(get_payment_gateway)]


def get_auth_service(
    request: Request,
    settings: SettingsDep,
    session: SessionDep,
    redis: Annotated[Redis, Depends(get_redis)],
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> AuthService:
    limiter = RateLimiter(redis, settings.rate_limit_prefix, settings.redis_op_timeout_seconds)
    client = ClientInfo(
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
        ip=client_address(request, trust_proxy_headers=settings.trust_proxy_headers)[:45],
    )
    return AuthService(session, settings, request.app.state.jwt_secret, limiter, mailer, client)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_sms_sender(request: Request) -> SmsSender:
    sender: SmsSender = request.app.state.sms
    return sender


def get_otp_service(
    request: Request,
    settings: SettingsDep,
    session: SessionDep,
    mailer: Annotated[Mailer, Depends(get_strict_mailer)],
    sms: Annotated[SmsSender, Depends(get_sms_sender)],
) -> OtpService:
    return OtpService(session, settings, request.app.state.jwt_secret, mailer, sms)


OtpServiceDep = Annotated[OtpService, Depends(get_otp_service)]


def get_otp_login_service(
    settings: SettingsDep,
    session: SessionDep,
    otp: OtpServiceDep,
    auth: AuthServiceDep,
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> OtpLoginService:
    return OtpLoginService(session, settings, otp, auth, mailer)


OtpLoginServiceDep = Annotated[OtpLoginService, Depends(get_otp_login_service)]


def get_password_reset_service(
    settings: SettingsDep, session: SessionDep, otp: OtpServiceDep, auth: AuthServiceDep
) -> PasswordResetService:
    return PasswordResetService(session, settings, otp, auth)


PasswordResetServiceDep = Annotated[PasswordResetService, Depends(get_password_reset_service)]


def get_account_service(
    session: SessionDep, auth: AuthServiceDep, otp: OtpServiceDep, settings: SettingsDep
) -> AccountService:
    return AccountService(session, auth, otp, settings)


AccountServiceDep = Annotated[AccountService, Depends(get_account_service)]


def get_fulfillment_service(
    session: SessionDep,
    storage: StorageDep,
    gateway: GatewayDep,
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> OrderFulfillmentService:
    return OrderFulfillmentService(session, gateway, mailer, storage)


FulfillmentServiceDep = Annotated[OrderFulfillmentService, Depends(get_fulfillment_service)]


def get_oauth_service(
    request: Request,
    settings: SettingsDep,
    session: SessionDep,
    auth: AuthServiceDep,
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> OAuthService | None:
    provider: OAuthProvider | None = request.app.state.oauth_provider
    if provider is None:
        return None
    return OAuthService(session, settings, request.app.state.jwt_secret, provider, auth, mailer)


# Google-ээр нэвтрэх тохируулаагүй бол None.
OAuthServiceDep = Annotated[OAuthService | None, Depends(get_oauth_service)]


def get_cart_service(
    settings: SettingsDep, session: SessionDep, storage: StorageDep
) -> CartService:
    return CartService(session, storage, settings)


CartServiceDep = Annotated[CartService, Depends(get_cart_service)]


def get_wishlist_service(session: SessionDep, storage: StorageDep) -> WishlistService:
    return WishlistService(session, storage)


WishlistServiceDep = Annotated[WishlistService, Depends(get_wishlist_service)]


def get_address_service(session: SessionDep) -> AddressService:
    return AddressService(session)


AddressServiceDep = Annotated[AddressService, Depends(get_address_service)]


def _settlement(
    session: SessionDep, settings: Settings, gateway: PaymentGateway | None, mailer: Mailer
) -> PaymentSettlement | None:
    return PaymentSettlement(session, gateway, settings, mailer) if gateway else None


def get_checkout_service(
    settings: SettingsDep,
    session: SessionDep,
    storage: StorageDep,
    gateway: GatewayDep,
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> CheckoutService:
    settlement = _settlement(session, settings, gateway, mailer)
    return CheckoutService(session, storage, settings, gateway, settlement)


CheckoutServiceDep = Annotated[CheckoutService, Depends(get_checkout_service)]


def get_order_service(
    session: SessionDep, storage: StorageDep, settings: SettingsDep, gateway: GatewayDep
) -> OrderService:
    return OrderService(session, storage, settings, gateway)


OrderServiceDep = Annotated[OrderService, Depends(get_order_service)]


def get_webhook_service(
    settings: SettingsDep,
    session: SessionDep,
    gateway: GatewayDep,
    mailer: Annotated[Mailer, Depends(get_mailer)],
) -> WebhookService:
    if gateway is None:
        raise ProblemError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "Төлбөр боломжгүй байна",
            type_=PAYMENTS_UNAVAILABLE_TYPE,
        )
    return WebhookService(session, gateway, PaymentSettlement(session, gateway, settings, mailer))


WebhookServiceDep = Annotated[WebhookService, Depends(get_webhook_service)]
