from typing import Any

from sqlalchemy import ColumnElement, Numeric, cast, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from lookalike.models import Order, OrderItem, Product, Review, User
from lookalike.repositories.patterns import contains_pattern

# A review needs a purchase that stands: paid and not returned or cancelled.
BUYER_STATUSES = ("paid", "shipped", "delivered")


class ReviewRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # --- the product ----------------------------------------------------------------------

    async def lock_active_product(self, product_id: int) -> bool:
        """Lock the product row (every change to its reviews starts here, so recomputing the
        average cannot lose a concurrent review). False when it does not exist or is withdrawn."""
        result = await self._session.execute(
            select(Product.id)
            .where(Product.id == product_id, Product.is_active.is_(True))
            .with_for_update()
        )
        return result.scalar_one_or_none() is not None

    async def lock_product(self, product_id: int) -> None:
        await self._session.execute(
            select(Product.id).where(Product.id == product_id).with_for_update()
        )

    async def product_is_active(self, product_id: int) -> bool:
        result = await self._session.execute(
            select(Product.id).where(Product.id == product_id, Product.is_active.is_(True))
        )
        return result.scalar_one_or_none() is not None

    async def recompute_rating(self, product_id: int) -> None:
        published = (
            select(
                func.coalesce(cast(func.round(func.avg(Review.rating), 2), Numeric(3, 2)), 0),
                func.count(),
            )
            .where(Review.product_id == product_id, Review.status == "published")
            .subquery()
        )
        average, count = published.c[0], published.c[1]
        await self._session.execute(
            update(Product)
            .where(Product.id == product_id)
            .values(
                rating_average=select(average).scalar_subquery(),
                rating_count=select(count).scalar_subquery(),
            )
        )

    # --- buying ---------------------------------------------------------------------------

    async def buyer_order_id(self, user_id: int, product_id: int) -> int | None:
        result = await self._session.execute(
            select(Order.id)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .where(
                Order.user_id == user_id,
                OrderItem.product_id == product_id,
                Order.status.in_(BUYER_STATUSES),
            )
            .order_by(Order.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    # --- reviews --------------------------------------------------------------------------

    def add(self, review: Review) -> None:
        self._session.add(review)

    async def flush(self) -> None:
        await self._session.flush()

    async def get(self, review_id: int, *, for_update: bool = False) -> Review | None:
        statement = select(Review).where(Review.id == review_id)
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def delete(self, review: Review) -> None:
        await self._session.delete(review)
        await self._session.flush()

    async def of_user(self, product_id: int, user_id: int) -> tuple[Review, User] | None:
        row = (
            await self._session.execute(
                select(Review, User)
                .join(User, User.id == Review.user_id)
                .where(Review.product_id == product_id, Review.user_id == user_id)
            )
        ).one_or_none()
        return (row[0], row[1]) if row else None

    async def author(self, user_id: int) -> User:
        return (await self._session.execute(select(User).where(User.id == user_id))).scalar_one()

    async def list_published(
        self, product_id: int, *, sort: str, offset: int, limit: int
    ) -> tuple[list[tuple[Review, User]], int]:
        where = (Review.product_id == product_id, Review.status == "published")
        order = {
            "newest": (Review.created_at.desc(), Review.id.desc()),
            "highest": (Review.rating.desc(), Review.created_at.desc(), Review.id.desc()),
            "lowest": (Review.rating.asc(), Review.created_at.desc(), Review.id.desc()),
        }[sort]
        total = (
            await self._session.execute(select(func.count()).select_from(Review).where(*where))
        ).scalar_one()
        rows = await self._session.execute(
            select(Review, User)
            .join(User, User.id == Review.user_id)
            .where(*where)
            .order_by(*order)
            .offset(offset)
            .limit(limit)
        )
        return [(r[0], r[1]) for r in rows.all()], int(total)

    async def distribution(self, product_id: int) -> list[int]:
        rows = await self._session.execute(
            select(Review.rating, func.count())
            .where(Review.product_id == product_id, Review.status == "published")
            .group_by(Review.rating)
        )
        counts = {rating: int(n) for rating, n in rows.all()}
        return [counts.get(stars, 0) for stars in range(1, 6)]

    # --- administrators -------------------------------------------------------------------

    def _admin_clauses(
        self, *, text_query: str | None, rating: int | None
    ) -> list[ColumnElement[bool]]:
        clauses: list[ColumnElement[bool]] = []
        if text_query:
            pattern = contains_pattern(text_query)
            clauses.append(
                or_(
                    Review.title.ilike(pattern, escape="\\"),
                    Review.body.ilike(pattern, escape="\\"),
                    Product.name.ilike(pattern, escape="\\"),
                    User.email.ilike(pattern, escape="\\"),
                )
            )
        if rating is not None:
            clauses.append(Review.rating == rating)
        return clauses

    async def list_all(
        self,
        *,
        text_query: str | None,
        status: str,
        rating: int | None,
        offset: int,
        limit: int,
    ) -> tuple[list[tuple[Review, User, Product]], int, dict[str, int]]:
        base: Any = (
            select(Review, User, Product)
            .join(User, User.id == Review.user_id)
            .join(Product, Product.id == Review.product_id)
        )
        clauses = self._admin_clauses(text_query=text_query, rating=rating)
        counts_rows = await self._session.execute(
            select(Review.status, func.count())
            .select_from(Review)
            .join(User, User.id == Review.user_id)
            .join(Product, Product.id == Review.product_id)
            .where(*clauses)
            .group_by(Review.status)
        )
        counts = {s: int(n) for s, n in counts_rows.all()}
        if status != "all":
            clauses.append(Review.status == status)
        total = counts.get(status, 0) if status != "all" else sum(counts.values())
        rows = await self._session.execute(
            base.where(*clauses)
            .order_by(Review.created_at.desc(), Review.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return [(r[0], r[1], r[2]) for r in rows.all()], total, counts

    async def get_with_details(self, review_id: int) -> tuple[Review, User, Product] | None:
        row = (
            await self._session.execute(
                select(Review, User, Product)
                .join(User, User.id == Review.user_id)
                .join(Product, Product.id == Review.product_id)
                .where(Review.id == review_id)
            )
        ).one_or_none()
        return (row[0], row[1], row[2]) if row else None
