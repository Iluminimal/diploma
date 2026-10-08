from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field


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


class SitemapEntry(BaseModel):
    id: int
    slug: str
    updated_at: datetime


class SitemapPage(BaseModel):
    """Every active product, in id order, lightly: what a sitemap needs and nothing else."""

    items: list[SitemapEntry]
    total: int
    page: int
    page_size: int
    pages: int


class SitemapQuery(BaseModel):
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=10_000)] = 5_000
