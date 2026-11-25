import asyncio
import time
from collections.abc import Sequence
from dataclasses import dataclass
from http import HTTPStatus

import numpy as np
from numpy.typing import NDArray
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import PRODUCT_NOT_FOUND_TYPE, ProblemError
from angel.core.logging import get_logger
from angel.core.uploads import ALLOWED_FORMATS, invalid_image
from angel.ml.classifier import LazyCategoryClassifier
from angel.ml.embeddings import EmbeddingService
from angel.ml.localizer import GarmentLocalizer, Region
from angel.ml.preprocess import InvalidImageError, load_image
from angel.repositories.catalog.products import ProductRepository, SearchFilters, SimilarProduct
from angel.schemas.catalog.search import (
    AppliedFilter,
    DetectedCategory,
    DetectResponse,
    GarmentResult,
    GarmentSearchResponse,
    RegionBox,
    RegionOut,
    SearchHit,
    SearchResponse,
    SearchTimings,
)
from angel.services.cache import SearchCache
from angel.services.catalog.catalog import CatalogService
from angel.services.catalog.query_parser import Vocabulary, apply_parsed, parse_search_text
from angel.services.mappers import to_product_out
from angel.storage import Storage

log = get_logger(__name__)

# JPEG decoder зургийг энэ хэмжээнээс дээш байх хугацаанд 1/2, 1/4, ... болгон багасгаж болно:
# утасны зурагт хамаагүй хурдан, ingestion catalogue-ийн зурагт ижил тохиргоо хэрэглэнэ.
DECODE_MIN_SIDE = 800
SIMILAR_DEFAULT_LIMIT = 12
GARMENT_DEFAULT_LIMIT = 12  # хувцас тутамд


def _ms(start: float, end: float | None = None) -> float:
    return round(((end or time.perf_counter()) - start) * 1000, 2)


def _combine(
    image: NDArray[np.float32], text: NDArray[np.float32], text_weight: float
) -> NDArray[np.float32]:
    """Хоёр нэгж vector-ийн жинлэсэн нийлбэр, дахин normalize хийнэ (cosine-д чиглэл л хэрэгтэй)."""
    combined = (1.0 - text_weight) * image + text_weight * text
    norm = float(np.linalg.norm(combined))
    if norm < 1e-6:  # зураг ба текст бүрэн арилгалцсан: зураг руу буцна
        return image
    return (combined / norm).astype(np.float32)


@dataclass(frozen=True)
class _Text:
    """Хайлтын текст, шүүлтүүр (задласныг нэмсэн), юу хэрэгжсэн.

    `text` нь шүүлтүүр болоогүй үлдэгдэл: зураг, барааны embedding-д нэмэхэд хангалттай, учир нь
    өнгө гэх мэт нь шүүлтүүрээр аль хэдийн хэрэгжсэн. `standalone` нь цэвэр текст хайлтад: таньсан
    өнгө, улирлын англи нэрийг нэмж ("Blue"), CLIP-д ч тэр утгыг өгнө."""

    text: str
    standalone: str
    filters: SearchFilters
    applied: list[AppliedFilter]


@dataclass(frozen=True)
class _Upload:
    """Upload хийсэн зургийг боловсруулсан үр дүн: сонгосон хэсгийн vector ба юу олдсон."""

    vector: NDArray[np.float32]
    detected: list[DetectedCategory]
    regions: list[RegionOut]
    selected: int
    decode_ms: float
    detect_ms: float
    embed_ms: float


def _region_out(region: Region) -> RegionOut:
    box = region.box
    return RegionOut(
        box=RegionBox(x=box.x0, y=box.y0, width=box.x1 - box.x0, height=box.y1 - box.y0),
        label=region.label,
        score=round(region.score, 4),
    )


class SearchService:
    def __init__(
        self,
        *,
        session: AsyncSession,
        embedder: EmbeddingService,
        classifier: LazyCategoryClassifier,
        localizer: GarmentLocalizer,
        cache: SearchCache,
        storage: Storage,
        max_upload_pixels: int,
        default_limit: int,
        hybrid_text_weight: float,
        detected_categories: int,
    ) -> None:
        self._session = session
        self._embedder = embedder
        self._classifier = classifier
        self._localizer = localizer
        self._cache = cache
        self._storage = storage
        self._max_pixels = max_upload_pixels
        self._default_limit = default_limit
        self._hybrid_text_weight = hybrid_text_weight
        self._detected = detected_categories

    async def search_by_image(
        self, data: bytes, filters: SearchFilters, limit: int | None, *, region: int = 0
    ) -> SearchResponse:
        started = time.perf_counter()
        upload = await self._embed_upload(data, region)
        hits, db_ms = await self._query(upload.vector, filters, limit)
        return self._respond("image", started, hits, db_ms, upload=upload)

    async def detect_garments(self, data: bytes) -> DetectResponse:
        """Зөвхөн хувцсыг олно (embedding, database, ангилагчгүй): камерын live preview-д хэдэн
        кадр тутамд дуудагддаг тул хамгийн хөнгөн зам. Зураг хадгалагдахгүй, лог ч бичихгүй."""
        regions, _, detect_ms = await self._locate_upload(data)
        return DetectResponse(regions=[_region_out(r) for r in regions], detect_ms=detect_ms)

    async def search_garments(
        self, data: bytes, filters: SearchFilters, limit: int | None
    ) -> GarmentSearchResponse:
        """Зурагт олдсон хувцас бүрийн төстэй бараа нэг дор. Бүх crop-ийг нэг batch-ээр embed
        хийнэ (хэсэг бүрт тусдаа model дуудлага хийхээс хурдан), харин database хайлт хэсэг тутамд
        нэг, дарааллаар (нэг session; ихдээ `yolo_max_regions` жижиг query)."""
        started = time.perf_counter()
        regions, decode_ms, detect_ms = await self._locate_upload(data)

        embed_started = time.perf_counter()
        vectors = await self._embedder.aembed_images([r.image for r in regions])
        embed_ms = _ms(embed_started)

        garments: list[GarmentResult] = []
        db_ms = 0.0
        for index, (region, vector) in enumerate(zip(regions, vectors, strict=True)):
            hits, took = await self._query(vector, filters, limit or GARMENT_DEFAULT_LIMIT)
            db_ms += took
            garments.append(
                GarmentResult(
                    index=index,
                    region=_region_out(region),
                    detected=await self._detect_categories(vector),
                    results=hits,
                )
            )
        total_ms = _ms(started)
        log.info("search", kind="garments", garments=len(garments), total_ms=total_ms, cached=False)
        return GarmentSearchResponse(
            garments=garments,
            timings=SearchTimings(
                decode_ms=decode_ms,
                detect_ms=detect_ms,
                embed_ms=embed_ms,
                db_ms=round(db_ms, 2),
                total_ms=total_ms,
            ),
        )

    async def search_by_text(
        self, query: str, filters: SearchFilters, limit: int | None, *, interpret: bool = False
    ) -> SearchResponse:
        started = time.perf_counter()
        parsed = await self._interpret(query, filters, interpret)
        if not parsed.standalone:
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Хайх зүйл алга",
                "Текст зөвхөн шүүлтүүр (жишээ нь үнэ) агуулж байна. "
                "Барааныхаа тухай хэдэн үг нэмнэ үү.",
            )
        text_vector, was_cached = await self._embed_text(parsed.standalone)
        embed_ms = _ms(started)
        hits, db_ms = await self._query(text_vector, parsed.filters, limit)
        return self._respond(
            "text",
            started,
            hits,
            db_ms,
            embed_ms=embed_ms,
            cached=was_cached,
            applied=parsed.applied,
        )

    async def search_hybrid(
        self,
        data: bytes,
        query: str,
        text_weight: float | None,
        filters: SearchFilters,
        limit: int | None,
        *,
        interpret: bool = False,
        region: int = 0,
    ) -> SearchResponse:
        """ "Энэ зураг шиг, гэхдээ ...": зураг ба текстийн embedding нэг орон зайд байдаг тул
        жинлэсэн нийлбэр query-г зургаас тайлбарласан өөрчлөлт рүү зөөнө. Текст бүхэлдээ
        шүүлтүүр болсон бол ("цэнхэр") зөвхөн зургаар хайна."""
        started = time.perf_counter()
        upload = await self._embed_upload(data, region)
        parsed = await self._interpret(query, filters, interpret)
        vector, was_cached, text_ms = await self._refine(upload.vector, parsed.text, text_weight)
        hits, db_ms = await self._query(vector, parsed.filters, limit)
        return self._respond(
            "hybrid",
            started,
            hits,
            db_ms,
            upload=upload,
            embed_ms=upload.embed_ms + text_ms,
            cached=was_cached,
            applied=parsed.applied,
        )

    async def similar_products(
        self,
        product_id: int,
        filters: SearchFilters,
        limit: int | None,
        *,
        query: str | None = None,
        text_weight: float | None = None,
        interpret: bool = False,
    ) -> SearchResponse:
        """Catalogue-ийн барааны хөрш, хадгалсан embedding-ээс. `query` өгвөл "энэ шиг, гэхдээ ..."
        гэж embedding-д текст нэмнэ: зөвхөн текстийг model-д өгнө, барааны зургийг дахин
        боловсруулахгүй."""
        started = time.perf_counter()
        limit = limit or SIMILAR_DEFAULT_LIMIT
        parsed = (
            await self._interpret(query, filters, interpret)
            if query is not None
            else _Text("", "", filters, [])
        )
        weight = self._hybrid_text_weight if text_weight is None else text_weight
        refinement = (parsed.text, weight) if parsed.text else None
        cached = await self._cache.get_similar(product_id, parsed.filters, limit, refinement)
        if cached is not None:
            return self._respond(
                "similar", started, cached, 0.0, cached=True, applied=parsed.applied
            )

        db_started = time.perf_counter()
        embedding = await self._stored_embedding(product_id)
        embed_ms: float | None = None
        if refinement is not None:
            embedding, _, embed_ms = await self._refine(embedding, parsed.text, weight)
        found = await self._neighbours(embedding, parsed.filters, limit, product_id)
        db_ms = max(0.0, _ms(db_started) - (embed_ms or 0.0))
        hits = self._to_hits(found)
        await self._cache.set_similar(product_id, parsed.filters, limit, hits, refinement)
        return self._respond(
            "similar", started, hits, db_ms, embed_ms=embed_ms, applied=parsed.applied
        )

    # --- алхмууд ---

    async def _locate_upload(self, data: bytes) -> tuple[list[Region], float, float]:
        """Upload-ыг decode хийж, хувцасны хэсгүүдийг олно: (хэсгүүд, decode_ms, detect_ms)."""
        decode_started = time.perf_counter()
        try:
            # Decode хийх нь CPU-ийн ажил (Pillow GIL-ийг чөлөөлдөг): event loop-оос холдуул.
            image = await asyncio.to_thread(
                load_image,
                data,
                min_side=DECODE_MIN_SIDE,
                formats=ALLOWED_FORMATS,
                max_pixels=self._max_pixels,
            )
        except InvalidImageError as exc:
            log.info("upload_rejected", reason=str(exc)[:200])
            raise invalid_image(
                "Файл нь JPEG, PNG эсвэл WebP зураг биш, эсвэл хэт өндөр нягтралтай байна."
            ) from exc
        decode_ms = _ms(decode_started)

        detect_started = time.perf_counter()
        regions = await self._localizer.alocate(image)
        return regions, decode_ms, _ms(detect_started)

    async def _detect_categories(self, vector: NDArray[np.float32]) -> list[DetectedCategory]:
        """Vector-ийн zero-shot ангиллын top таамаг (хэсэг бүрийн crop-оос)."""
        return [
            DetectedCategory(
                article_type=p.label.article_type,
                category_path=p.label.path,
                score=round(p.score, 4),
            )
            for p in (await self._classifier.get()).predict(vector, self._detected)
        ]

    async def _embed_upload(self, data: bytes, region: int) -> _Upload:
        regions, decode_ms, detect_ms = await self._locate_upload(data)
        if region >= len(regions):
            raise ProblemError(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "Хэсэг олдсонгүй",
                f"Зургаас {len(regions)} хэсэг олдсон тул {region} дугаартай хэсэг байхгүй байна.",
            )

        embed_started = time.perf_counter()
        vector = (await self._embedder.aembed_images([regions[region].image]))[0]
        embed_ms = _ms(embed_started)
        return _Upload(
            vector=vector,
            detected=await self._detect_categories(vector),
            regions=[_region_out(r) for r in regions],
            selected=region,
            decode_ms=decode_ms,
            detect_ms=detect_ms,
            embed_ms=embed_ms,
        )

    async def _embed_text(self, query: str) -> tuple[NDArray[np.float32], bool]:
        cached = await self._cache.get_text_embedding(query)
        if cached is not None:
            return cached, True
        vector = (await self._embedder.aembed_texts([query]))[0]
        await self._cache.set_text_embedding(query, vector)
        return vector, False

    async def _refine(
        self, vector: NDArray[np.float32], text: str, text_weight: float | None
    ) -> tuple[NDArray[np.float32], bool, float]:
        """`vector`-ийг текстээр зөөнө (текст хоосон бол өөрчлөхгүй)."""
        if not text:
            return vector, False, 0.0
        started = time.perf_counter()
        text_vector, was_cached = await self._embed_text(text)
        weight = self._hybrid_text_weight if text_weight is None else text_weight
        return _combine(vector, text_vector, weight), was_cached, _ms(started)

    async def _interpret(self, text: str, filters: SearchFilters, interpret: bool) -> _Text:
        if not interpret:
            return _Text(text, text, filters, [])
        options = await CatalogService(self._session, self._storage, self._cache).filters()
        parsed = parse_search_text(text, vocabulary=Vocabulary.from_catalog(options))
        merged, applied = apply_parsed(parsed, filters)
        return _Text(
            parsed.remaining,
            parsed.embedding_text,
            merged,
            [AppliedFilter.model_validate({"key": key, "value": value}) for key, value in applied],
        )

    async def _stored_embedding(self, product_id: int) -> NDArray[np.float32]:
        async with self._session.begin():
            embedding = await ProductRepository(self._session).get_embedding(product_id)
        if embedding is None:
            raise ProblemError(
                HTTPStatus.NOT_FOUND,
                "Бараа олдсонгүй",
                f"{product_id} дугаартай бараа байхгүй байна.",
                type_=PRODUCT_NOT_FOUND_TYPE,
            )
        return embedding

    async def _neighbours(
        self,
        vector: NDArray[np.float32],
        filters: SearchFilters,
        limit: int,
        exclude_id: int,
    ) -> Sequence[SimilarProduct]:
        async with self._session.begin():
            return await ProductRepository(self._session).search_similar(
                vector, filters=filters, limit=limit, exclude_id=exclude_id
            )

    async def _query(
        self, vector: NDArray[np.float32], filters: SearchFilters, limit: int | None
    ) -> tuple[list[SearchHit], float]:
        started = time.perf_counter()
        # Transaction (түүнтэй хамт pool-ийн connection) зөвхөн query-д барьцаалагдана, decode хийх
        # эсвэл model ажиллуулах үед хэзээ ч биш.
        async with self._session.begin():
            found = await ProductRepository(self._session).search_similar(
                vector, filters=filters, limit=limit or self._default_limit
            )
        return self._to_hits(found), _ms(started)

    def _to_hits(self, found: Sequence[SimilarProduct]) -> list[SearchHit]:
        return [
            SearchHit(
                product=to_product_out(hit.product, self._storage),
                similarity=round(max(-1.0, min(1.0, hit.similarity)), 4),
            )
            for hit in found
        ]

    def _respond(
        self,
        kind: str,
        started: float,
        hits: list[SearchHit],
        db_ms: float,
        *,
        upload: _Upload | None = None,
        embed_ms: float | None = None,
        cached: bool = False,
        applied: list[AppliedFilter] | None = None,
    ) -> SearchResponse:
        total_ms = _ms(started)
        # Зураг, query текст, хэрэглэгчийн өгөгдлийг хэзээ ч биш: зөвхөн ачааллыг харахад хэрэгтэй
        # зүйл.
        log.info("search", kind=kind, results=len(hits), total_ms=total_ms, cached=cached)
        return SearchResponse(
            results=hits,
            detected=upload.detected if upload else [],
            regions=upload.regions if upload else [],
            selected_region=upload.selected if upload else None,
            timings=SearchTimings(
                decode_ms=upload.decode_ms if upload else None,
                detect_ms=upload.detect_ms if upload else None,
                embed_ms=upload.embed_ms if embed_ms is None and upload else embed_ms,
                db_ms=db_ms,
                total_ms=total_ms,
            ),
            cached=cached,
            applied=applied or [],
        )
