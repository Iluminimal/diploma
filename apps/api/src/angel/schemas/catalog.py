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


class NavNode(BaseModel):
    """A group, sub-category or article type in the shopper-facing tree. `path` is what the
    `category` listing filter and the /c/... URLs take, e.g. "apparel/topwear/tshirts"."""

    name: str
    slug: str
    path: str
    level: int
    product_count: int
    children: list["NavNode"] = []


class NavDepartment(BaseModel):
    slug: str
    name: str
    genders: list[str]
    product_count: int
    groups: list[NavNode]


class CatalogNav(BaseModel):
    """Women / Men / Kids, each with its own counts, for the mega menu and category pages."""

    departments: list[NavDepartment]


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
