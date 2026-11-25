from typing import Annotated, Literal

from fastapi import UploadFile
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from angel.schemas.catalog.product import FilterParams, ProductOut

MAX_RESULTS = 60
QUERY_MAX_LENGTH = 200

Limit = Annotated[int | None, Field(ge=1, le=MAX_RESULTS, description="Defaults to 24.")]
QueryText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=QUERY_MAX_LENGTH)
]


TextWeight = Annotated[
    float | None,
    Field(
        ge=0.0,
        le=1.0,
        description="Share of the text in the combined query (the image gets the rest).",
    ),
]
Interpret = Annotated[
    bool,
    Field(
        description=(
            "Pull colours, genders, seasons, usages, prices ('under $50', '50000₮-аас доош') and "
            "'in stock' out of the text (Mongolian or English) and apply them as filters. Filters "
            "you pass yourself are never overridden. What was applied is listed in `applied`."
        )
    ),
]


RegionIndex = Annotated[
    int,
    Field(
        ge=0,
        le=19,
        description=(
            "Which detected garment to search: an index into the `regions` of a previous "
            "response (0 = the most prominent one)."
        ),
    ),
]


class TextSearchRequest(BaseModel):
    query: QueryText
    limit: Limit = None
    filters: FilterParams = FilterParams()
    interpret: Interpret = False


class ImageSearchForm(FilterParams):
    """Зургаар хайх multipart form: зураг болон нэмэлт filter-үүд."""

    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]
    limit: Limit = None
    region: RegionIndex = 0


class HybridSearchForm(ImageSearchForm):
    query: QueryText
    text_weight: TextWeight = None
    interpret: Interpret = False


class SearchHit(BaseModel):
    product: ProductOut
    similarity: Annotated[float, Field(description="Cosine similarity, 1 = same direction.")]


class DetectedCategory(BaseModel):
    article_type: str
    category_path: str
    score: Annotated[float, Field(ge=0, le=1, description="Zero-shot probability.")]


class RegionBox(BaseModel):
    """Зургийн хэмжээнд харьцуулсан (0..1) хайрцаг: зүүн дээд өнцөг, өргөн, өндөр."""

    x: Annotated[float, Field(ge=0, le=1)]
    y: Annotated[float, Field(ge=0, le=1)]
    width: Annotated[float, Field(ge=0, le=1)]
    height: Annotated[float, Field(ge=0, le=1)]


class RegionOut(BaseModel):
    """Зураг дээр олдсон нэг хувцас (эсвэл гутал, цүнх). Хайлт сонгосон хэсгээрээ явна."""

    box: RegionBox
    label: Annotated[str | None, Field(description="Detector class; null for the whole image.")]
    score: Annotated[float, Field(ge=0, le=1, description="Detector confidence.")]


class SearchTimings(BaseModel):
    decode_ms: float | None = None
    detect_ms: float | None = None
    embed_ms: float | None = None
    db_ms: float
    total_ms: float


class DetectForm(BaseModel):
    """Камерын live preview-ийн кадр: зөвхөн хувцсыг олж хайрцгийг нь буцаана (хайлт хийхгүй)."""

    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]


class DetectResponse(BaseModel):
    # Хамгийн тод нь эхэнд. Юу ч олдоогүй бол нэг `label: null` хэсэг (бүтэн зураг).
    regions: list[RegionOut]
    detect_ms: float


class GarmentForm(FilterParams):
    """Зургаас хувцас бүрийг хайх multipart form: зураг, шүүлтүүр, хувцас тутмын үр дүнгийн тоо."""

    file: Annotated[UploadFile, Field(description="JPEG, PNG or WebP, up to 8 MB")]
    limit: Annotated[
        int | None, Field(ge=1, le=MAX_RESULTS, description="Per garment. Defaults to 12.")
    ] = None


class GarmentResult(BaseModel):
    """Зурагт олдсон нэг хувцас ба түүнтэй төстэй бараанууд."""

    index: Annotated[int, Field(ge=0, description="Index to pass as `region` to /search/image.")]
    region: RegionOut
    # Энэ хэсгийн crop-ийн zero-shot таамаг (detector-ийн label-ээс найдвартай).
    detected: list[DetectedCategory]
    results: list[SearchHit]


class GarmentSearchResponse(BaseModel):
    # Хамгийн тод хувцас эхэнд (`/search/image`-ийн `regions`-той ижил эрэмбэ).
    garments: list[GarmentResult]
    timings: SearchTimings


class AppliedFilter(BaseModel):
    """Текстээс задалж хэрэгжүүлсэн шүүлтүүр. `value`: өнгө, хүйс, улирал, хэрэглээнд англи нэр;
    `min_price`/`max_price`-д cent-ийн тоо; `in_stock`-д "true"."""

    key: Literal["gender", "color", "season", "usage", "min_price", "max_price", "in_stock"]
    value: str


class SearchResponse(BaseModel):
    results: list[SearchHit]
    # Зураг юу харуулж буйг таамагласан хамгийн магадлалтай нь эхэнд. Текст эсвэл төстэй барааны
    # хайлтад хоосон.
    detected: list[DetectedCategory] = []
    # Зурагт олдсон хэсгүүд (хамгийн тод нь эхэнд) ба хайлт аль хэсгээр явсан нь (`regions` дахь
    # индекс). Текст эсвэл төстэй барааны хайлтад хоосон.
    regions: list[RegionOut] = []
    selected_region: int | None = None
    timings: SearchTimings
    # Текстийн embedding эсвэл үр дүнгийн бүх жагсаалт Redis cache-ээс ирсэн бол True.
    cached: bool = False
    # `interpret=true` үед текстээс таньж хэрэгжүүлсэн шүүлтүүрүүд.
    applied: list[AppliedFilter] = []


class SimilarQuery(FilterParams):
    model_config = ConfigDict(extra="forbid")

    limit: Limit = None
    # "Энэ шиг, гэхдээ ...": хадгалсан embedding-д текст нэмнэ (`/search/hybrid`-тай ижил жин).
    query: QueryText | None = None
    text_weight: TextWeight = None
    interpret: Interpret = False
