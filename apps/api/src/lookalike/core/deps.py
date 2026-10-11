from collections.abc import AsyncIterator
from http import HTTPStatus
from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from lookalike.core.config import Settings
from lookalike.core.cookies import CART_COOKIE, set_cart_cookie
from lookalike.core.errors import (
    FORBIDDEN_TYPE,
    PAYMENTS_UNAVAILABLE_TYPE,
    UNAUTHENTICATED_TYPE,
    ProblemError,
)
from lookalike.core.mail import Mailer
from lookalike.core.rate_limit import RateLimiter
from lookalike.core.security import decode_access_token, new_opaque_token
from lookalike.ml.classifier import GarmentLocalizer, LazyCategoryClassifier
from lookalike.ml.embeddings import EmbeddingService
from lookalike.models import User
from lookalike.oauth import OAuthProvider
from lookalike.payments import PaymentGateway
from lookalike.repositories.health import HealthRepository
from lookalike.repositories.users import UserRepository
from lookalike.services.addresses import AddressService
from lookalike.services.admin_orders import AdminOrderService
from lookalike.services.admin_products import AdminProductService
from lookalike.services.auth import AuthService
from lookalike.services.cache import SearchCache
from lookalike.services.cart import CartOwner, CartService
from lookalike.services.catalog import CatalogService
from lookalike.services.checkout import CheckoutService
from lookalike.services.health import HealthService
from lookalike.services.oauth import OAuthService
from lookalike.services.orders import OrderService
from lookalike.services.payments import PaymentSettlement
from lookalike.services.search import SearchService
from lookalike.services.webhooks import WebhookService
from lookalike.services.wishlist import WishlistService
from lookalike.storage import Storage


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
    request: Request, settings: SettingsDep, session: SessionDep, storage: StorageDep
) -> SearchService:
    embedder: EmbeddingService | None = request.app.state.embedding_service
    if embedder is None or not embedder.is_loaded():
        raise ProblemError(
            HTTPStatus.SERVICE_UNAVAILABLE, "Search unavailable", "The model is not loaded yet."
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
            HTTPStatus.SERVICE_UNAVAILABLE, "Model unavailable", "The model is not loaded yet."
        )
    cache: SearchCache = request.app.state.search_cache
    return AdminProductService(
        session,
        storage,
        embedder,
        cache,
        currency=settings.currency,
        max_upload_pixels=settings.max_upload_pixels,
    )


AdminProductServiceDep = Annotated[AdminProductService, Depends(get_admin_product_service)]


def get_admin_order_service(session: SessionDep, storage: StorageDep) -> AdminOrderService:
    return AdminOrderService(session, storage)


AdminOrderServiceDep = Annotated[AdminOrderService, Depends(get_admin_order_service)]


def get_catalog_service(
    request: Request, session: SessionDep, storage: StorageDep
) -> CatalogService:
    cache: SearchCache = request.app.state.search_cache
    return CatalogService(session, storage, cache)


CatalogServiceDep = Annotated[CatalogService, Depends(get_catalog_service)]


# --- authentication ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False, description="Access token from /auth/login or /auth/refresh")
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthenticated(detail: str) -> ProblemError:
    return ProblemError(
        HTTPStatus.UNAUTHORIZED,
        "Not signed in",
        detail,
        type_=UNAUTHENTICATED_TYPE,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_optional_user_id(request: Request, credentials: BearerDep) -> int | None:
    """The signed-in user's id, None for a visitor. A token that is present but bad or expired
    is a 401, never silently "a guest": the client must refresh, not lose its cart."""
    if credentials is None:
        return None
    user_id = decode_access_token(credentials.credentials, request.app.state.jwt_secret)
    if user_id is None:
        raise _unauthenticated("Your session has expired.")
    return user_id


def get_current_user_id(user_id: Annotated[int | None, Depends(get_optional_user_id)]) -> int:
    if user_id is None:
        raise _unauthenticated("Sign in to continue.")
    return user_id


OptionalUserDep = Annotated[int | None, Depends(get_optional_user_id)]
CurrentUserDep = Annotated[int, Depends(get_current_user_id)]


async def get_current_admin(user_id: CurrentUserDep, session: SessionDep) -> User:
    """The signed-in administrator. The role is read from the database on every request (it is
    not in the token), so demoting or deactivating someone takes effect at once."""
    async with session.begin():
        user = await UserRepository(session).get(user_id)
        if user is None or not user.is_active:
            raise _unauthenticated("Please sign in again.")
        if not user.is_admin:
            raise ProblemError(
                HTTPStatus.FORBIDDEN,
                "Administrators only",
                "Your account is not allowed to use the admin area.",
                type_=FORBIDDEN_TYPE,
            )
    return user


AdminDep = Annotated[User, Depends(get_current_admin)]


def get_cart_owner(request: Request, user_id: OptionalUserDep) -> CartOwner:
    """Whose cart this request reads: the user's, else the guest cookie's (may be absent)."""
    return CartOwner(user_id=user_id, guest_token=request.cookies.get(CART_COOKIE))


def get_cart_writer(
    request: Request, response: Response, settings: SettingsDep, user_id: OptionalUserDep
) -> CartOwner:
    """Like `get_cart_owner`, but a first-time guest is given a cart cookie."""
    token = request.cookies.get(CART_COOKIE)
    if user_id is None and not token:
        token = new_opaque_token()
        set_cart_cookie(response, settings, token)
    return CartOwner(user_id=user_id, guest_token=token)


CartOwnerDep = Annotated[CartOwner, Depends(get_cart_owner)]
CartWriterDep = Annotated[CartOwner, Depends(get_cart_writer)]


def no_store(response: Response) -> None:
    """Personal data must never sit in a shared cache."""
    response.headers["Cache-Control"] = "no-store"


# --- commerce services ------------------------------------------------------------------------


def get_mailer(request: Request) -> Mailer:
    mailer: Mailer = request.app.state.mailer
    return mailer


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
    return AuthService(session, settings, request.app.state.jwt_secret, limiter, mailer)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


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


# None when sign-in with Google is not configured.
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


def get_order_service(session: SessionDep, storage: StorageDep) -> OrderService:
    return OrderService(session, storage)


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
            "Payments are not available",
            type_=PAYMENTS_UNAVAILABLE_TYPE,
        )
    return WebhookService(gateway, PaymentSettlement(session, gateway, settings, mailer))


WebhookServiceDep = Annotated[WebhookService, Depends(get_webhook_service)]
