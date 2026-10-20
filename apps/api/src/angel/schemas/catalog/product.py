from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_FILTER_VALUES = 12
FilterValues = Annotated[list[str], Field(max_length=MAX_FILTER_VALUES)]


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
    # Нийтлэгдсэн сэтгэгдлүүдээс; сэтгэгдэл гарах хүртэл дундаж байхгүй.
    rating_average: float | None
    rating_count: int


class FilterParams(BaseModel):
    """Catalogue-ийн filter-үүд, жагсаалт (query string), зургаар хайлт (form field), текстээр
    хайлт (JSON) гурвын хооронд хуваалцдаг. Хэд хэдэн утга өгөхийн тулд параметрийг давтана:
    `?gender=Men&gender=Unisex`. Үнэ нь бусад API шиг бүхэл cent-ээр."""

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
    # Худалдан авагчийн навигаци (GET /catalog/nav): "men" мэт department slug болон
    # "apparel/topwear/tshirts" мэт зангилааны path. Хоёулаа бусад filter-ийг цаашид нарийсгана.
    department: Annotated[str | None, Field(min_length=1, max_length=40)] = None
    category: Annotated[str | None, Field(min_length=1, max_length=400)] = None
    # `q` өгөгдсөн бол "relevance", үгүй бол "newest" гэж үзнэ.
    sort: ProductSortKey | None = None
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=60)] = 24


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    page: int
    page_size: int
    pages: int
