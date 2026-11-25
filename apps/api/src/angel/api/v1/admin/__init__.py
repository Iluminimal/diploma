"""Back-office-ийн API. Хэсэг бүрийн өмнө нэг хамгаалалт: эхлээд rate limit (admin хэсэгт token
таамаглахыг удаашруулна), дараа нь аль нэг ажилтан мөн эсэхийг шалгана, юу ч cache хийхгүй.

Аль role юу хийхийг endpoint бүр өөрөө тодорхойлно: бараа, нөөц, захиалгын ачилт (ship/deliver)
нь агуулахын ажилтных (`WarehouseDep`); хэрэглэгч, сэтгэгдэл, статистик, захиалгын цуцлалт,
буцаалт нь админых (`AdminDep`); бараа, захиалга унших нь аль ч ажилтных (`StaffDep`)."""

from fastapi import APIRouter, Depends

from angel.api.v1.admin import (
    audit,
    customers,
    export,
    fulfillment,
    orders,
    products,
    reviews,
    stats,
)
from angel.core.deps import get_current_admin, get_current_staff, no_store
from angel.core.rate_limit import rate_limit
from angel.schemas.problem import ProblemDetail

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(rate_limit("admin")), Depends(get_current_staff), Depends(no_store)],
    responses={
        401: {"model": ProblemDetail, "description": "Not signed in"},
        403: {
            "model": ProblemDetail,
            "description": "Not a staff account, or not allowed for this role",
        },
        429: {"model": ProblemDetail, "description": "Rate limit exceeded"},
    },
)
# Бараа, захиалгад endpoint бүр өөрийн role-оо тодорхойлно (дээрх тайлбар).
for section in (products, orders, fulfillment):
    router.include_router(section.router)
# Хэрэглэгч, статистик, сэтгэгдэл бүхлээрээ админых: агуулахын ажилтан хүрэхгүй.
for section in (audit, customers, export, stats, reviews):
    router.include_router(section.router, dependencies=[Depends(get_current_admin)])
