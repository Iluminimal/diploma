from typing import Annotated

from fastapi import UploadFile
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from angel.schemas.catalog.product import FilterParams, ProductOut

MAX_RESULTS = 60
QUERY_MAX_LENGTH = 200

Limit = Annotated[int | None, Field(ge=1, le=MAX_RESULTS, description="Defaults to 24.")]
QueryText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=QUERY_MAX_LENGTH)
]


class TextSearchRequest(BaseModel):
    query: QueryText
    limit: Limit = None
    filters: FilterParams = FilterParams()


class ImageSearchForm(FilterParams):
    """Зургаар хайх multipart form: зураг болон нэмэлт filter-үүд."""

    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]
    limit: Limit = None


class HybridSearchForm(ImageSearchForm):
    query: QueryText
    text_weight: Annotated[
        float | None,
        Field(
            ge=0.0,
            le=1.0,
            description="Share of the text in the combined query (the image gets the rest).",
        ),
    ] = None


class SearchHit(BaseModel):
    product: ProductOut
    similarity: Annotated[float, Field(description="Cosine similarity, 1 = same direction.")]


class DetectedCategory(BaseModel):
    article_type: str
    category_path: str
    score: Annotated[float, Field(ge=0, le=1, description="Zero-shot probability.")]


class SearchTimings(BaseModel):
    decode_ms: float | None = None
    embed_ms: float | None = None
    db_ms: float
    total_ms: float


class SearchResponse(BaseModel):
    results: list[SearchHit]
    # Зураг юу харуулж буйг таамагласан хамгийн магадлалтай нь эхэнд. Текст эсвэл төстэй барааны
    # хайлтад хоосон.
    detected: list[DetectedCategory] = []
    timings: SearchTimings
    # Текстийн embedding эсвэл үр дүнгийн бүх жагсаалт Redis cache-ээс ирсэн бол True.
    cached: bool = False


class SimilarQuery(FilterParams):
    model_config = ConfigDict(extra="forbid")

    limit: Limit = None
