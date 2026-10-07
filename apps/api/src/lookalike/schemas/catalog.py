from pydantic import BaseModel


class CategoryNode(BaseModel):
    id: int
    name: str
    slug: str
    path: str
    level: int
    children: list["CategoryNode"] = []


class PriceRange(BaseModel):
    min_cents: int
    max_cents: int


class CatalogFilters(BaseModel):
    """Everything a filter sidebar needs to render."""

    categories: list[CategoryNode]
    genders: list[str]
    colors: list[str]
    seasons: list[str]
    usages: list[str]
    price_range: PriceRange
