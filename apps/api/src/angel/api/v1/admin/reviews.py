"""Review-ийн moderation."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query

from angel.core.deps import (
    ReviewServiceDep,
)
from angel.schemas.problem import ProblemDetail
from angel.schemas.reviews.reviews import AdminReviewListQuery, AdminReviewOut, AdminReviewPage

# Rate limit, role шалгалт нь __init__.py дахь router-т нэг дор хийгддэг (эхлээд rate limit).

router = APIRouter()

_REVIEW_NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {"model": ProblemDetail, "description": "No such review"}
}


@router.get("/reviews", summary="Every review, newest first, with counts per status")
async def list_reviews(
    query: Annotated[AdminReviewListQuery, Query()], service: ReviewServiceDep
) -> AdminReviewPage:
    return await service.admin_list(query)


@router.post(
    "/reviews/{review_id}/hide",
    summary="Take a review off the product page and out of the average",
    responses=_REVIEW_NOT_FOUND,
)
async def hide_review(
    review_id: Annotated[int, Path(ge=1, le=2**63 - 1)], service: ReviewServiceDep
) -> AdminReviewOut:
    return await service.set_status(review_id, published=False)


@router.post(
    "/reviews/{review_id}/publish",
    summary="Put a hidden review back",
    responses=_REVIEW_NOT_FOUND,
)
async def publish_review(
    review_id: Annotated[int, Path(ge=1, le=2**63 - 1)], service: ReviewServiceDep
) -> AdminReviewOut:
    return await service.set_status(review_id, published=True)
