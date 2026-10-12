from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path

from lookalike.core.deps import CurrentUserDep, ReviewServiceDep
from lookalike.core.rate_limit import rate_limit
from lookalike.schemas.problem import ProblemDetail
from lookalike.schemas.review import ReviewOut, ReviewUpdate

router = APIRouter(prefix="/reviews", tags=["reviews"])

ReviewId = Annotated[int, Path(ge=1, le=2**63 - 1)]
_NOT_YOURS: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "Not one of your reviews"}
}


@router.patch(
    "/{review_id}",
    summary="Change your review",
    dependencies=[Depends(rate_limit("review"))],
    responses=_NOT_YOURS,
)
async def update_review(
    review_id: ReviewId, body: ReviewUpdate, user_id: CurrentUserDep, service: ReviewServiceDep
) -> ReviewOut:
    return await service.update(user_id, review_id, body)


@router.delete(
    "/{review_id}",
    status_code=204,
    summary="Delete your review",
    dependencies=[Depends(rate_limit("review"))],
    responses=_NOT_YOURS,
)
async def delete_review(
    review_id: ReviewId, user_id: CurrentUserDep, service: ReviewServiceDep
) -> None:
    await service.delete(user_id, review_id)
