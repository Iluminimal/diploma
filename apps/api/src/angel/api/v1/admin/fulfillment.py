"""Агуулахын самбар: илгээх дараалал, нөөцийн анхааруулга, өөрийн үйлдлүүд. Аль ч ажилтан харна."""

from fastapi import APIRouter

from angel.core.deps import FulfillmentBoardServiceDep, StaffDep
from angel.schemas.admin.fulfillment import FulfillmentBoard

router = APIRouter()


@router.get("/fulfillment", summary="The warehouse board: what to ship and what to restock")
async def fulfillment_board(
    staff: StaffDep, service: FulfillmentBoardServiceDep
) -> FulfillmentBoard:
    return await service.board(staff)
