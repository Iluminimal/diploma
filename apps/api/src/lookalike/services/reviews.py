import math
from http import HTTPStatus

from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.core.errors import (
    PRODUCT_NOT_FOUND_TYPE,
    REVIEW_EXISTS_TYPE,
    REVIEW_NOT_ALLOWED_TYPE,
    REVIEW_NOT_FOUND_TYPE,
    ProblemError,
)
from lookalike.core.logging import get_logger
from lookalike.models import Product, Review, User
from lookalike.repositories.reviews import ReviewRepository
from lookalike.schemas.review import (
    AdminReviewListQuery,
    AdminReviewOut,
    AdminReviewPage,
    AdminReviewProduct,
    RatingSummary,
    ReviewCreate,
    ReviewListQuery,
    ReviewOut,
    ReviewPage,
    ReviewUpdate,
    ReviewViewer,
)
from lookalike.services.account import DELETED_NAME
from lookalike.services.cache import SearchCache
from lookalike.services.mappers import product_image
from lookalike.storage import Storage

log = get_logger(__name__)


def author_name(user: User) -> str:
    """ "Ada Lovelace" is shown as "Ada L."; one name, or a deleted account, as it is."""
    parts = user.full_name.split()
    if user.full_name == DELETED_NAME or len(parts) < 2:
        return user.full_name or DELETED_NAME
    return f"{parts[0]} {parts[-1][0].upper()}."


def to_review_out(review: Review, user: User) -> ReviewOut:
    return ReviewOut(
        id=review.id,
        rating=review.rating,
        title=review.title,
        body=review.body,
        author=author_name(user),
        status="published" if review.status == "published" else "hidden",
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def _no_product(product_id: int) -> ProblemError:
    return ProblemError(
        HTTPStatus.NOT_FOUND,
        "Product not found",
        f"There is no product with id {product_id}.",
        type_=PRODUCT_NOT_FOUND_TYPE,
    )


def _no_review(review_id: int) -> ProblemError:
    return ProblemError(
        HTTPStatus.NOT_FOUND,
        "Review not found",
        f"There is no review {review_id}.",
        type_=REVIEW_NOT_FOUND_TYPE,
    )


class ReviewService:
    def __init__(self, session: AsyncSession, storage: Storage, cache: SearchCache) -> None:
        self._session = session
        self._storage = storage
        self._cache = cache
        self._reviews = ReviewRepository(session)

    # --- the product page ----------------------------------------------------------------

    async def list(
        self, product_id: int, query: ReviewListQuery, viewer_id: int | None
    ) -> ReviewPage:
        async with self._session.begin():
            if not await self._reviews.product_is_active(product_id):
                raise _no_product(product_id)
            rows, total = await self._reviews.list_published(
                product_id,
                sort=query.sort,
                offset=(query.page - 1) * query.page_size,
                limit=query.page_size,
            )
            distribution = await self._reviews.distribution(product_id)
            viewer = await self._viewer(product_id, viewer_id) if viewer_id else None
        count = sum(distribution)
        average = (
            round(sum(stars * n for stars, n in enumerate(distribution, start=1)) / count, 2)
            if count
            else None
        )
        return ReviewPage(
            items=[to_review_out(review, user) for review, user in rows],
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
            summary=RatingSummary(average=average, count=count, distribution=distribution),
            viewer=viewer,
        )

    async def _viewer(self, product_id: int, user_id: int) -> ReviewViewer:
        own = await self._reviews.of_user(product_id, user_id)
        purchased = (
            own is not None or await self._reviews.buyer_order_id(user_id, product_id) is not None
        )
        return ReviewViewer(
            purchased=purchased,
            review=to_review_out(*own) if own else None,
            can_review=purchased and own is None,
        )

    # --- a buyer's own review ------------------------------------------------------------

    async def create(self, user_id: int, product_id: int, data: ReviewCreate) -> ReviewOut:
        async with self._session.begin():
            if not await self._reviews.lock_active_product(product_id):
                raise _no_product(product_id)
            if await self._reviews.of_user(product_id, user_id) is not None:
                raise ProblemError(
                    HTTPStatus.CONFLICT,
                    "Already reviewed",
                    "You have already reviewed this product. Edit your review instead.",
                    type_=REVIEW_EXISTS_TYPE,
                )
            order_id = await self._reviews.buyer_order_id(user_id, product_id)
            if order_id is None:
                raise ProblemError(
                    HTTPStatus.FORBIDDEN,
                    "Only buyers can review",
                    "You can review a product once you have bought it.",
                    type_=REVIEW_NOT_ALLOWED_TYPE,
                )
            review = Review(
                product_id=product_id,
                user_id=user_id,
                order_id=order_id,
                rating=data.rating,
                title=data.title,
                body=data.body,
            )
            self._reviews.add(review)
            await self._reviews.flush()
            await self._reviews.recompute_rating(product_id)
            author = await self._reviews.author(user_id)
        await self._cache.invalidate_catalogue()
        log.info("review_created", review_id=review.id, product_id=product_id, rating=data.rating)
        return to_review_out(review, author)

    async def update(self, user_id: int, review_id: int, data: ReviewUpdate) -> ReviewOut:
        async with self._session.begin():
            review = await self._own_locked(user_id, review_id)
            if "rating" in data.model_fields_set and data.rating is not None:
                review.rating = data.rating
            if "title" in data.model_fields_set:
                review.title = data.title
            if "body" in data.model_fields_set:
                review.body = data.body
            await self._reviews.flush()
            await self._reviews.recompute_rating(review.product_id)
            # `updated_at` is set by the database; read it back before the session closes.
            await self._session.refresh(review)
            author = await self._reviews.author(user_id)
        await self._cache.invalidate_catalogue()
        return to_review_out(review, author)

    async def delete(self, user_id: int, review_id: int) -> None:
        async with self._session.begin():
            review = await self._own_locked(user_id, review_id)
            product_id = review.product_id
            await self._reviews.delete(review)
            await self._reviews.recompute_rating(product_id)
        await self._cache.invalidate_catalogue()
        log.info("review_deleted", review_id=review_id, product_id=product_id)

    async def _own_locked(self, user_id: int, review_id: int) -> Review:
        """The caller's review with the product and the review locked (product first, always).
        Somebody else's review is simply not found."""
        review = await self._reviews.get(review_id)
        if review is None or review.user_id != user_id:
            raise _no_review(review_id)
        await self._reviews.lock_product(review.product_id)
        locked = await self._reviews.get(review_id, for_update=True)
        if locked is None:
            raise _no_review(review_id)
        return locked

    # --- moderation ----------------------------------------------------------------------

    async def admin_list(self, query: AdminReviewListQuery) -> AdminReviewPage:
        async with self._session.begin():
            rows, total, counts = await self._reviews.list_all(
                text_query=query.q,
                status=query.status,
                rating=query.rating,
                offset=(query.page - 1) * query.page_size,
                limit=query.page_size,
            )
        return AdminReviewPage(
            items=[self._admin_out(*row) for row in rows],
            total=total,
            page=query.page,
            page_size=query.page_size,
            pages=math.ceil(total / query.page_size),
            status_counts=counts,
        )

    async def set_status(self, review_id: int, *, published: bool) -> AdminReviewOut:
        status = "published" if published else "hidden"
        async with self._session.begin():
            found = await self._reviews.get(review_id)
            if found is None:
                raise _no_review(review_id)
            await self._reviews.lock_product(found.product_id)
            review = await self._reviews.get(review_id, for_update=True)
            if review is None:
                raise _no_review(review_id)
            if review.status != status:
                review.status = status
                await self._reviews.flush()
                await self._reviews.recompute_rating(review.product_id)
            details = await self._reviews.get_with_details(review_id)
        assert details is not None
        await self._cache.invalidate_catalogue()
        log.info("review_status_changed", review_id=review_id, status=status)
        return self._admin_out(*details)

    def _admin_out(self, review: Review, user: User, product: Product) -> AdminReviewOut:
        return AdminReviewOut(
            **to_review_out(review, user).model_dump(),
            product=AdminReviewProduct(
                id=product.id,
                name=product.name,
                slug=product.slug,
                image=product_image(product.image_key, product.blur_data_url, self._storage),
            ),
            user_id=user.id,
            author_email=user.email,
        )
