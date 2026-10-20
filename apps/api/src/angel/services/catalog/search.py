import asyncio
import time
from collections.abc import Sequence
from http import HTTPStatus

import numpy as np
from numpy.typing import NDArray
from sqlalchemy.ext.asyncio import AsyncSession

from angel.core.errors import PRODUCT_NOT_FOUND_TYPE, ProblemError
from angel.core.logging import get_logger
from angel.core.uploads import ALLOWED_FORMATS, invalid_image
from angel.ml.classifier import GarmentLocalizer, LazyCategoryClassifier
from angel.ml.embeddings import EmbeddingService
from angel.ml.preprocess import InvalidImageError, load_image
from angel.repositories.catalog.products import ProductRepository, SearchFilters, SimilarProduct
from angel.schemas.catalog.search import DetectedCategory, SearchHit, SearchResponse, SearchTimings
from angel.services.cache import SearchCache
from angel.services.mappers import to_product_out
from angel.storage import Storage

log = get_logger(__name__)

# JPEG decoder зургийг энэ хэмжээнээс дээш байх хугацаанд 1/2, 1/4, ... болгон багасгаж болно:
# утасны зурагт хамаагүй хурдан, ingestion catalogue-ийн зурагт ижил тохиргоо хэрэглэнэ.
DECODE_MIN_SIDE = 800
SIMILAR_DEFAULT_LIMIT = 12


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
        self, data: bytes, filters: SearchFilters, limit: int | None
    ) -> SearchResponse:
        started = time.perf_counter()
        image_vector, detected, decode_ms, embed_ms = await self._embed_upload(data)
        hits, db_ms = await self._query(image_vector, filters, limit)
        return self._respond(
            "image", started, hits, db_ms, detected=detected, decode_ms=decode_ms, embed_ms=embed_ms
        )

    async def search_by_text(
        self, query: str, filters: SearchFilters, limit: int | None
    ) -> SearchResponse:
        started = time.perf_counter()
        text_vector, was_cached = await self._embed_text(query)
        embed_ms = _ms(started)
        hits, db_ms = await self._query(text_vector, filters, limit)
        return self._respond("text", started, hits, db_ms, embed_ms=embed_ms, cached=was_cached)

    async def search_hybrid(
        self,
        data: bytes,
        query: str,
        text_weight: float | None,
        filters: SearchFilters,
        limit: int | None,
    ) -> SearchResponse:
        """ "Энэ зураг шиг, гэхдээ ...": зураг ба текстийн embedding нэг орон зайд байдаг тул
        жинлэсэн нийлбэр query-г зургаас тайлбарласан өөрчлөлт рүү зөөнө."""
        started = time.perf_counter()
        image_vector, detected, decode_ms, embed_ms = await self._embed_upload(data)
        text_started = time.perf_counter()
        text_vector, was_cached = await self._embed_text(query)
        embed_ms += _ms(text_started)
        weight = self._hybrid_text_weight if text_weight is None else text_weight
        hits, db_ms = await self._query(_combine(image_vector, text_vector, weight), filters, limit)
        return self._respond(
            "hybrid",
            started,
            hits,
            db_ms,
            detected=detected,
            decode_ms=decode_ms,
            embed_ms=embed_ms,
            cached=was_cached,
        )

    async def similar_products(
        self, product_id: int, filters: SearchFilters, limit: int | None
    ) -> SearchResponse:
        """Catalogue-ийн барааны хөрш, хадгалсан embedding-ээс: inference хийхгүй."""
        started = time.perf_counter()
        limit = limit or SIMILAR_DEFAULT_LIMIT
        cached = await self._cache.get_similar(product_id, filters, limit)
        if cached is not None:
            return self._respond("similar", started, cached, 0.0, cached=True)

        db_started = time.perf_counter()
        async with self._session.begin():
            repository = ProductRepository(self._session)
            embedding = await repository.get_embedding(product_id)
            if embedding is None:
                raise ProblemError(
                    HTTPStatus.NOT_FOUND,
                    "Product not found",
                    f"There is no product with id {product_id}.",
                    type_=PRODUCT_NOT_FOUND_TYPE,
                )
            found = await repository.search_similar(
                embedding, filters=filters, limit=limit, exclude_id=product_id
            )
        db_ms = _ms(db_started)
        hits = self._to_hits(found)
        await self._cache.set_similar(product_id, filters, limit, hits)
        return self._respond("similar", started, hits, db_ms)

    # --- алхмууд ---

    async def _embed_upload(
        self, data: bytes
    ) -> tuple[NDArray[np.float32], list[DetectedCategory], float, float]:
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
                "The file is not a valid JPEG, PNG or WebP image, or its dimensions are too large."
            ) from exc
        decode_ms = _ms(decode_started)

        embed_started = time.perf_counter()
        region = self._localizer.locate(image)[0]
        vector = (await self._embedder.aembed_images([region]))[0]
        embed_ms = _ms(embed_started)
        detected = [
            DetectedCategory(
                article_type=p.label.article_type,
                category_path=p.label.path,
                score=round(p.score, 4),
            )
            for p in (await self._classifier.get()).predict(vector, self._detected)
        ]
        return vector, detected, decode_ms, embed_ms

    async def _embed_text(self, query: str) -> tuple[NDArray[np.float32], bool]:
        cached = await self._cache.get_text_embedding(query)
        if cached is not None:
            return cached, True
        vector = (await self._embedder.aembed_texts([query]))[0]
        await self._cache.set_text_embedding(query, vector)
        return vector, False

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
        detected: list[DetectedCategory] | None = None,
        decode_ms: float | None = None,
        embed_ms: float | None = None,
        cached: bool = False,
    ) -> SearchResponse:
        total_ms = _ms(started)
        # Зураг, query текст, хэрэглэгчийн өгөгдлийг хэзээ ч биш: зөвхөн ачааллыг харахад хэрэгтэй
        # зүйл.
        log.info("search", kind=kind, results=len(hits), total_ms=total_ms, cached=cached)
        return SearchResponse(
            results=hits,
            detected=detected or [],
            timings=SearchTimings(
                decode_ms=decode_ms, embed_ms=embed_ms, db_ms=db_ms, total_ms=total_ms
            ),
            cached=cached,
        )
