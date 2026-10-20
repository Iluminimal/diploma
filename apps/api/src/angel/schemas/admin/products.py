from datetime import datetime
from typing import Annotated, Literal

from fastapi import UploadFile
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from angel.schemas.catalog.product import ProductImage

Gender = Literal["Men", "Women", "Boys", "Girls", "Unisex"]
Season = Literal["Fall", "Spring", "Summer", "Winter"]
ProductName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=300)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
# $100,000.00: дэлгүүрийн зардаг ямар ч зүйлээс хамаагүй их, харин таслалын алдааг барих хэмжээний
# бага.
PriceCents = Annotated[int, Field(ge=0, le=10_000_000, description="Price in cents.")]
StockQuantity = Annotated[int, Field(ge=0, le=100_000)]
Year = Annotated[int, Field(ge=1900, le=2100)]


class AdminCategory(BaseModel):
    """Article type; бараа эдгээрийн аль нэгэнд ангилагдана."""

    id: int
    path: str
    master_category: str
    sub_category: str
    article_type: str


class ProductFields(BaseModel):
    name: ProductName
    category_id: int
    gender: Gender
    base_colour: ShortText | None = None
    season: Season | None = None
    usage: ShortText | None = None
    year: Year | None = None
    price_cents: PriceCents
    stock_quantity: StockQuantity = 0


class AdminProductCreateForm(ProductFields):
    """Multipart form: барааны зураг болон дэлгэрэнгүй мэдээлэл. Зургаас thumbnail-ууд болон
    visual search-ийн эрэмбэлэх embedding гарна."""

    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]
    is_active: bool = True


class AdminProductUpdate(BaseModel):
    """Зөвхөн илгээсэн талбарууд өөрчлөгдөнө. `null` илгээвэл заавал биш талбар цэвэрлэгдэнэ."""

    model_config = ConfigDict(extra="forbid")

    name: ProductName | None = None
    category_id: int | None = None
    gender: Gender | None = None
    base_colour: ShortText | None = None
    season: Season | None = None
    usage: ShortText | None = None
    year: Year | None = None
    price_cents: PriceCents | None = None
    stock_quantity: StockQuantity | None = None


class AdminProductImageForm(BaseModel):
    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]


AdminStatusFilter = Literal["all", "active", "inactive"]
AdminStockFilter = Literal["all", "low", "out"]
AdminSortKey = Literal["newest", "price_asc", "price_desc", "stock_asc"]


class AdminProductListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: Annotated[str | None, Field(min_length=1, max_length=200, description="Name or id")] = None
    status: AdminStatusFilter = "all"
    # "low": нөөцөд байгаа ч дуусах дөхсөн (LOW_STOCK_THRESHOLD-ийг үз); "out": огт үлдээгүй.
    stock: AdminStockFilter = "all"
    category_id: int | None = None
    sort: AdminSortKey = "newest"
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 25


class AdminProductOut(BaseModel):
    id: int
    slug: str
    name: str
    category_id: int
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
    stock_quantity: int
    is_active: bool
    # Admin хэсэгт үүсгэсэн бараанд NULL; импортолсонд dataset-ийн id.
    source_id: int | None
    embedding_version: str
    image: ProductImage
    created_at: datetime
    updated_at: datetime


class AdminProductPage(BaseModel):
    items: list[AdminProductOut]
    total: int
    page: int
    page_size: int
    pages: int
