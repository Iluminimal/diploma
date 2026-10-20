"""Administrator-ын API. Хэсэг бүрийн өмнө нэг хамгаалалт: эхлээд rate limit (admin хэсэгт token
таамаглахыг удаашруулна), дараа нь role шалгана, юу ч cache хийхгүй."""

from fastapi import APIRouter, Depends

from angel.api.v1.admin import customers, orders, products, reviews, stats
from angel.core.deps import get_current_admin, no_store
from angel.core.rate_limit import rate_limit
from angel.schemas.problem import ProblemDetail

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(rate_limit("admin")), Depends(get_current_admin), Depends(no_store)],
    responses={
        401: {"model": ProblemDetail, "description": "Not signed in"},
        403: {"model": ProblemDetail, "description": "Not an administrator"},
        429: {"model": ProblemDetail, "description": "Rate limit exceeded"},
    },
)
for section in (products, orders, customers, stats, reviews):
    router.include_router(section.router)
