from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from lookalike.models import Category, Product


@dataclass(frozen=True)
class FilterOptions:
    genders: list[str]
    colours: list[str]
    seasons: list[str]
    usages: list[str]
    min_price_cents: int
    max_price_cents: int


class CategoryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def all_categories(self) -> list[Category]:
        result = await self._session.execute(
            select(Category).order_by(Category.level, Category.name)
        )
        return list(result.scalars())

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
