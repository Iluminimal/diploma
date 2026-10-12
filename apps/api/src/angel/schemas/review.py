from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from angel.schemas.product import ProductImage

ReviewStatus = Literal["published", "hidden"]
ReviewSort = Literal["newest", "highest", "lowest"]

Rating = Annotated[int, Field(ge=1, le=5, description="Stars, 1 to 5")]
Title = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Body = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


def _blank_is_none(value: str | None) -> str | None:
    return value or None


class ReviewCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rating: Rating
    title: Title | None = None
    body: Body | None = None

    _blank = field_validator("title", "body")(_blank_is_none)


class ReviewUpdate(BaseModel):
    """Only the fields sent change; `null` clears the title or the text."""

    model_config = ConfigDict(extra="forbid")

    rating: Rating | None = None
    title: Title | None = None
    body: Body | None = None

    _blank = field_validator("title", "body")(_blank_is_none)

    @field_validator("rating")
    @classmethod
    def _rating_is_not_cleared(cls, value: int | None) -> int | None:
        if value is None:
            raise ValueError("rating cannot be removed")
        return value


class ReviewListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sort: ReviewSort = "newest"
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=50)] = 10


class ReviewOut(BaseModel):
    id: int
    rating: int
    title: str | None
    body: str | None
    # First name and the last name's initial ("Ada L."): a person, but not findable.
    author: str
    status: ReviewStatus
    created_at: datetime
    updated_at: datetime


class RatingSummary(BaseModel):
    average: float | None = Field(description="None until there is a published review")
    count: int
    distribution: list[int] = Field(description="Published reviews with 1, 2, 3, 4 and 5 stars")


class ReviewViewer(BaseModel):
    """What the signed-in visitor can do on this product."""

    purchased: bool = Field(description="Has a paid order containing the product")
    review: ReviewOut | None = Field(description="Their own review, even one that is hidden")
    can_review: bool = Field(description="Bought it and has not reviewed it yet")


class ReviewPage(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int
    pages: int
    summary: RatingSummary
    viewer: ReviewViewer | None = Field(description="Only when a signed-in visitor asks")


# --- administrators ---------------------------------------------------------------------------

AdminReviewStatusFilter = Literal["all", "published", "hidden"]


class AdminReviewListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: Annotated[
        str | None, Field(min_length=1, max_length=100, description="Text, product or email")
    ] = None
    status: AdminReviewStatusFilter = "all"
    rating: Annotated[int | None, Field(ge=1, le=5)] = None
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 25


class AdminReviewProduct(BaseModel):
    id: int
    name: str
    slug: str
    image: ProductImage


class AdminReviewOut(ReviewOut):
    product: AdminReviewProduct
    user_id: int
    author_email: str


class AdminReviewPage(BaseModel):
    items: list[AdminReviewOut]
    total: int
    page: int
    page_size: int
    pages: int
    status_counts: dict[str, int]
