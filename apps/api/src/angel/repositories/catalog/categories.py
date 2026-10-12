from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute, aliased

from angel.models import Category, Product


@dataclass(frozen=True)
class FilterOptions:
    genders: list[str]
    colours: list[str]
    seasons: list[str]
    usages: list[str]
    min_price_cents: int
    max_price_cents: int


@dataclass(frozen=True)
class LeafCategory:
    """An article type with the names of its ancestors, which products copy."""

    id: int
    path: str
    master_category: str
    sub_category: str
    article_type: str


class CategoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def all_categories(self) -> list[Category]:
        result = await self._session.execute(
            select(Category).order_by(Category.level, Category.name)
        )
        return list(result.scalars())

    async def leaf_categories(self, category_id: int | None = None) -> list[LeafCategory]:
        """Every article type (level 3), active products or not, for the admin's category picker."""
        sub = aliased(Category)
        master = aliased(Category)
        statement = (
            select(Category.id, Category.path, master.name, sub.name, Category.name)
            .join(sub, Category.parent_id == sub.id)
            .join(master, sub.parent_id == master.id)
            .where(Category.level == 3)
            .order_by(master.name, sub.name, Category.name)
        )
        if category_id is not None:
            statement = statement.where(Category.id == category_id)
        rows = await self._session.execute(statement)
        return [LeafCategory(*row) for row in rows.all()]

    async def gender_category_counts(self) -> list[tuple[str, int, int]]:
        """(gender, article type id, active products), one row per populated combination."""
        rows = await self._session.execute(
            select(Product.gender, Product.category_id, func.count(Product.id))
            .where(Product.is_active.is_(True), Product.category_id.is_not(None))
            .group_by(Product.gender, Product.category_id)
        )
        return [(gender, category_id, n) for gender, category_id, n in rows.all()]

    async def searchable_article_types(self) -> list[Category]:
        """Leaf categories that have active products (what search can return), the one with
        the most products first. A few article types (e.g. "Shorts") exist under several parents."""
        result = await self._session.execute(
            select(Category)
            .join(Product, Product.category_id == Category.id)
            .where(Category.level == 3, Product.is_active.is_(True))
            .group_by(Category.id)
            .order_by(func.count(Product.id).desc(), Category.id)
        )
        return list(result.scalars())

    async def filter_options(self) -> FilterOptions:
        async def distinct(column: InstrumentedAttribute[Any]) -> list[str]:
            rows = await self._session.execute(
                select(column)
                .where(Product.is_active.is_(True), column.is_not(None))
                .distinct()
                .order_by(column)
            )
            return [value for (value,) in rows.all()]

        prices = (
            await self._session.execute(
                select(func.min(Product.price_cents), func.max(Product.price_cents)).where(
                    Product.is_active.is_(True)
                )
            )
        ).one()
        return FilterOptions(
            genders=await distinct(Product.gender),
            colours=await distinct(Product.base_colour),
            seasons=await distinct(Product.season),
            usages=await distinct(Product.usage),
            min_price_cents=prices[0] or 0,
            max_price_cents=prices[1] or 0,
        )
