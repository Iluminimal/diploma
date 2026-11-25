"""CSV гаргалт (тайлан): зөвхөн админ. Дээд тал нь `EXPORT_LIMIT` мөр."""

from typing import Annotated

from fastapi import APIRouter, Query, Response

from angel.core.csv_export import csv_response
from angel.core.deps import AdminDashboardServiceDep, AdminOrderServiceDep
from angel.schemas.admin.dashboard import StatsQuery
from angel.schemas.admin.orders import AdminOrderListQuery

router = APIRouter(prefix="/export", tags=["export"])

EXPORT_LIMIT = 10_000


@router.get(
    "/stats",
    summary="Daily revenue, orders, units and new customers of a period as CSV",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}},
)
async def export_stats(
    query: Annotated[StatsQuery, Query()], service: AdminDashboardServiceDep
) -> Response:
    stats = await service.stats(query)
    return csv_response(
        f"angel-stats-{stats.start}-{stats.end}.csv",
        ["date", "revenue_cents", "orders", "units", "new_customers"],
        [[p.date, p.revenue_cents, p.orders, p.units, p.new_customers] for p in stats.series],
    )


@router.get(
    "/orders",
    summary="Orders matching the current filter as CSV, newest first",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}},
)
async def export_orders(
    query: Annotated[AdminOrderListQuery, Query()], service: AdminOrderServiceDep
) -> Response:
    page = await service.list(query.model_copy(update={"page": 1, "page_size": EXPORT_LIMIT}))
    return csv_response(
        "angel-orders.csv",
        [
            "number",
            "created_at",
            "status",
            "customer_name",
            "customer_email",
            "items",
            "total_cents",
            "currency",
            "payment_status",
        ],
        [
            [
                o.number,
                o.created_at.isoformat(),
                o.status,
                o.customer_name,
                o.customer_email,
                o.item_count,
                o.total_cents,
                o.currency,
                o.payment_status or "",
            ]
            for o in page.items
        ],
    )
