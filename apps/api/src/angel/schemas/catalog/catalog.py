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
    """Filter sidebar зурахад хэрэгтэй бүх зүйл."""

    categories: list[CategoryNode]
    genders: list[str]
    colors: list[str]
    seasons: list[str]
    usages: list[str]
    price_range: PriceRange


class NavNode(BaseModel):
    """Худалдан авагчид харагдах модны бүлэг, дэд ангилал эсвэл article type. `path` нь
    `category` жагсаалтын filter болон /c/... URL-ын авдаг утга, жишээ нь
    "apparel/topwear/tshirts"."""

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
    """Women / Men / Kids тус бүр өөрийн тоотой, mega menu болон ангиллын хуудсанд."""

    departments: list[NavDepartment]


class SitemapEntry(BaseModel):
    id: int
    slug: str
    updated_at: datetime


class SitemapPage(BaseModel):
    """Идэвхтэй бүх бараа id-н дарааллаар, хөнгөн хэлбэрээр: sitemap-д хэрэгтэй зүйл л."""

    items: list[SitemapEntry]
    total: int
    page: int
    page_size: int
    pages: int


class SitemapQuery(BaseModel):
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=10_000)] = 5_000
