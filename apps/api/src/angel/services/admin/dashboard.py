import math
from datetime import UTC, datetime, timedelta
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.config import Settings
from angel.core.errors import FORBIDDEN_TYPE, ProblemError
from angel.core.logging import get_logger
from angel.models import User
from angel.repositories.accounts.users import RefreshTokenRepository, UserRepository
from angel.repositories.admin.dashboard import DashboardRepository
from angel.repositories.commerce.orders import OrderRepository
from angel.schemas.admin.dashboard import (
    AdminCustomer,
    AdminCustomerDetail,
    AdminCustomerListQuery,
    AdminCustomerPage,
    AdminStats,
    DailyPoint,
    Delta,
    LowStockProduct,
    TopProduct,
)
from angel.services.mappers import product_image, to_admin_order_summary
from angel.storage import Storage

log = get_logger(__name__)
TOP_PRODUCTS = 5
LOW_STOCK_SHOWN = 8
RECENT_ORDERS = 6


def _average(revenue: int, orders: int) -> int:
    return round(revenue / orders) if orders else 0


class AdminDashboardService:
    def __init__(self, session: AsyncSession, storage: Storage, settings: Settings) -> None:
        self._session = session
        self._storage = storage
        self._settings = settings
        self._stats = DashboardRepository(session)
        self._orders = OrderRepository(session)
        self._users = UserRepository(session)

    async def stats(self, days: int) -> AdminStats:
        # Whole UTC days, ending with today, and the same number of days before them to compare.
        end = datetime.combine(
            datetime.now(UTC).date() + timedelta(days=1), datetime.min.time(), UTC
        )
        start = end - timedelta(days=days)
        before = start - timedelta(days=days)
        async with self._session.begin():
            revenue, orders = await self._stats.revenue_and_orders(start, end)
            prev_revenue, prev_orders = await self._stats.revenue_and_orders(before, start)
            units = await self._stats.units(start, end)
            prev_units = await self._stats.units(before, start)
            customers = await self._stats.new_customers(start, end)
            prev_customers = await self._stats.new_customers(before, start)
            daily = await self._stats.daily(start, end)
            counts = await self._stats.status_counts()
            top = await self._stats.top_products(start, end, TOP_PRODUCTS)
            low, low_total, out_total = await self._stats.low_stock(
                self._settings.low_stock_threshold, LOW_STOCK_SHOWN
            )
            recent, _ = await self._orders.list_all(
                text_query=None, status="all", limit=RECENT_ORDERS, offset=0
            )
            recent_orders = [to_admin_order_summary(order) for order in recent]
            low_stock = [
                LowStockProduct(
                    id=p.id,
                    name=p.name,
                    slug=p.slug,
                    stock_quantity=p.stock_quantity,
                    image=product_image(p.image_key, p.blur_data_url, self._storage),
                )
                for p in low
            ]
        first = start.date()
        series = [
            DailyPoint(
                date=day, revenue_cents=daily.get(day, (0, 0))[0], orders=daily.get(day, (0, 0))[1]
            )
            for day in (first + timedelta(days=i) for i in range(days))
        ]
        return AdminStats(
            days=days,
            currency=self._settings.currency,
            revenue_cents=Delta(current=revenue, previous=prev_revenue),
            orders=Delta(current=orders, previous=prev_orders),
            units=Delta(current=units, previous=prev_units),
            new_customers=Delta(current=customers, previous=prev_customers),
            average_order_cents=Delta(
                current=_average(revenue, orders), previous=_average(prev_revenue, prev_orders)
            ),
            series=series,
            status_counts=counts,
            to_ship=counts.get("paid", 0),
            awaiting_payment=counts.get("pending", 0),
            low_stock_threshold=self._settings.low_stock_threshold,
            low_stock=low_stock,
            low_stock_total=low_total,
            out_of_stock_total=out_total,
            top_products=[
                TopProduct(
                    product_id=pid,
                    name=name,
                    slug=slug,
                    image=product_image(image_key, None, self._storage),
                    units=units_sold,
                    revenue_cents=cents,
                )
                for pid, name, slug, image_key, units_sold, cents in top
            ],
            recent_orders=recent_orders,
        )

    # --- customers ----------------------------------------------------------------------------

    async def customers(self, query: AdminCustomerListQuery) -> AdminCustomerPage:
        async with self._session.begin():
            rows, total = await self._stats.list_customers(
                text_query=query.q,
                status=query.status,
                sort=query.sort,
                limit=query.page_size,
                offset=(query.page - 1) * query.page_size,
            )
        return AdminCustomerPage(
            items=[_customer(*row) for row in rows],
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
        )

    async def customer(self, user_id: int) -> AdminCustomerDetail:
        async with self._session.begin():
            row = await self._stats.get_customer(user_id)
            if row is None:
                raise _customer_not_found(user_id)
            user = row[0]
            providers = await self._users.providers(user.id)
            orders = await self._stats.orders_of(user.id, 20)
            recent = [to_admin_order_summary(order) for order in orders]
        base = _customer(*row)
        return AdminCustomerDetail(
            **base.model_dump(),
            providers=providers,
            has_password=user.password_hash is not None,
            recent_orders=recent,
        )

    async def set_active(self, admin: User, user_id: int, *, active: bool) -> AdminCustomerDetail:
        """Suspend or reinstate a customer. A suspended customer cannot sign in or refresh a
        session; what they ordered is unaffected."""
        if user_id == admin.id:
            raise _forbidden("You cannot suspend your own account.")
        async with self._session.begin():
            user = await self._users.get(user_id)
            if user is None or user.email.endswith("@deleted.invalid"):
                raise _customer_not_found(user_id)
            if user.is_admin:
                raise _forbidden("Administrator accounts are managed from the command line.")
            if user.is_active != active:
                user.is_active = active
                self._session.add(user)
                if not active:
                    await RefreshTokenRepository(self._session).revoke_all_for_user(
                        user.id, datetime.now(UTC)
                    )
        log.info("admin_customer_active_changed", user_id=user_id, active=active, admin_id=admin.id)
        return await self.customer(user_id)


def _customer(user: User, orders: int, spent: int, last_order: datetime | None) -> AdminCustomer:
    return AdminCustomer(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        created_at=user.created_at,
        orders_count=orders,
        total_spent_cents=spent,
        last_order_at=last_order,
    )


def _customer_not_found(user_id: int) -> ProblemError:
    return ProblemError(
        HTTPStatus.NOT_FOUND, "Customer not found", f"There is no customer {user_id}."
    )


def _forbidden(detail: str) -> ProblemError:
    return ProblemError(HTTPStatus.FORBIDDEN, "Not allowed", detail, type_=FORBIDDEN_TYPE)
