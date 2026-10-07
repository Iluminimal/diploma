from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_FILTER_VALUES = 12
FilterValues = Annotated[list[str], Field(max_length=MAX_FILTER_VALUES)]
FilterValue = Annotated[str, Field(min_length=1, max_length=100)]


class ProductImage(BaseModel):
    thumb_400: str
    thumb_800: str
    blur_data_url: str | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    gender: str
    master_category: str
    sub_category: str
    article_type: str
    base_colour: str | None
    season: str | None
    usage: str | None
    year: int | None
    price_cents: int
    currency: str
    in_stock: bool
    image: ProductImage


class FilterParams(BaseModel):
    """Catalogue filters, shared by listing (query string), image search (form fields) and text
    search (JSON). Repeat a parameter to allow several values: `?gender=Men&gender=Unisex`.
    Prices are integer cents, like everywhere else in the API."""

    gender: FilterValues = []
    master_category: FilterValues = []
    sub_category: FilterValues = []
    article_type: FilterValues = []
    color: FilterValues = []
    season: FilterValues = []
    usage: FilterValues = []
    min_price: Annotated[int | None, Field(ge=0, le=10_000_000)] = None
    max_price: Annotated[int | None, Field(ge=0, le=10_000_000)] = None
    in_stock: bool = False

    @model_validator(mode="after")
    def _price_range_is_ordered(self) -> "FilterParams":
        if (
            self.min_price is not None
            and self.max_price is not None
            and self.min_price > self.max_price
        ):
            raise ValueError("min_price must not be greater than max_price")
        return self


ProductSortKey = Literal["newest", "price_asc", "price_desc", "relevance"]


class ProductListQuery(FilterParams):
    model_config = ConfigDict(extra="forbid")

    q: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    # Defaults to "relevance" when `q` is given, otherwise "newest".
    sort: ProductSortKey | None = None
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=60)] = 24


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int
