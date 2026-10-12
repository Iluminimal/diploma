"""Redis caches for search. Every operation is best effort: a Redis error or timeout is
logged and treated as a miss, so the cache can only ever make search faster, never break it."""

import asyncio
import hashlib
import json
from dataclasses import asdict
from typing import Any

import numpy as np
from numpy.typing import NDArray
from pydantic import TypeAdapter
from redis.asyncio import Redis

from angel.core.logging import get_logger
from angel.repositories.products import SearchFilters
from angel.schemas.catalog import CatalogFilters
from angel.schemas.search import SearchHit
from angel.services.taxonomy import TaxonomySnapshot

log = get_logger(__name__)

_HITS = TypeAdapter(list[SearchHit])


def normalize_query(query: str) -> str:
    """Casing and spacing never change what a text query means to FashionCLIP's tokenizer
    (it lowercases), so they must not split the cache either."""
    return " ".join(query.lower().split())


class SearchCache:
    """Keys carry the embedding version: after a model or preprocessing change (re-embed) old
    entries are simply never read again and expire on their own."""

    def __init__(
        self,
        redis: Redis,
        *,
        embedding_version: str,
        dimension: int,
        text_ttl_seconds: int,
        similar_ttl_seconds: int,
        filters_ttl_seconds: int = 600,
        timeout_seconds: float,
    ) -> None:
        self._redis = redis
        self._version = embedding_version
        self._dimension = dimension
        self._text_ttl = text_ttl_seconds
        self._similar_ttl = similar_ttl_seconds
        self._filters_ttl = filters_ttl_seconds
        self._timeout = timeout_seconds

    # --- text embeddings -------------------------------------------------------------------

    def _text_key(self, query: str) -> str:
        digest = hashlib.sha256(normalize_query(query).encode()).hexdigest()
        return f"emb:txt:{self._version}:{digest}"

    async def get_text_embedding(self, query: str) -> NDArray[np.float32] | None:
        raw = await self._get(self._text_key(query))
        if raw is None or len(raw) != self._dimension * 4:
            return None
        return np.frombuffer(raw, dtype=np.float32).copy()

    async def set_text_embedding(self, query: str, embedding: NDArray[np.float32]) -> None:
        await self._set(
            self._text_key(query), embedding.astype(np.float32).tobytes(), self._text_ttl
        )

    # --- similar products ------------------------------------------------------------------

    def _similar_key(self, product_id: int, filters: SearchFilters, limit: int) -> str:
        spec = json.dumps(asdict(filters), sort_keys=True)
        digest = hashlib.sha256(spec.encode()).hexdigest()[:16]
        return f"sim:{self._version}:{product_id}:{limit}:{digest}"

    async def get_similar(
        self, product_id: int, filters: SearchFilters, limit: int
    ) -> list[SearchHit] | None:
        raw = await self._get(self._similar_key(product_id, filters, limit))
        if raw is None:
            return None
        try:
            return _HITS.validate_json(raw)
        except ValueError:
            log.warning("cache_entry_invalid", kind="similar")
            return None

    async def set_similar(
        self, product_id: int, filters: SearchFilters, limit: int, hits: list[SearchHit]
    ) -> None:
        await self._set(
            self._similar_key(product_id, filters, limit),
            _HITS.dump_json(hits),
            self._similar_ttl,
        )

    # --- catalogue filter options ------------------------------------------------------------

    @property
    def _filters_key(self) -> str:
        return f"catalog:filters:{self._version}"

    async def get_catalog_filters(self) -> CatalogFilters | None:
        raw = await self._get(self._filters_key)
        if raw is None:
            return None
        try:
            return CatalogFilters.model_validate_json(raw)
        except ValueError:
            return None

    async def set_catalog_filters(self, filters: CatalogFilters) -> None:
        await self._set(self._filters_key, filters.model_dump_json().encode(), self._filters_ttl)

    # --- category navigation -----------------------------------------------------------------

    @property
    def _nav_key(self) -> str:
        return f"catalog:nav:{self._version}"

    async def get_taxonomy(self) -> TaxonomySnapshot | None:
        raw = await self._get(self._nav_key)
        if raw is None:
            return None
        try:
            return TaxonomySnapshot.model_validate_json(raw)
        except ValueError:
            return None

    async def set_taxonomy(self, snapshot: TaxonomySnapshot) -> None:
        await self._set(self._nav_key, snapshot.model_dump_json().encode(), self._filters_ttl)

    # --- invalidation ----------------------------------------------------------------------

    async def invalidate_catalogue(self) -> None:
        """Forget cached similar-product lists and filter options after an admin change, so a
        deactivated or repriced product does not linger in them until their TTL runs out."""
        try:
            await asyncio.wait_for(self._invalidate(), self._timeout * 20)
        except Exception as exc:
            log.warning("cache_unavailable", op="invalidate", error=type(exc).__name__)

    async def _invalidate(self) -> None:
        batch: list[bytes] = [self._filters_key.encode(), self._nav_key.encode()]
        async for key in self._redis.scan_iter(match=f"sim:{self._version}:*", count=500):
            batch.append(key)
            if len(batch) >= 500:
                await self._redis.delete(*batch)
                batch = []
        if batch:
            await self._redis.delete(*batch)

    # --- plumbing --------------------------------------------------------------------------

    async def _get(self, key: str) -> bytes | None:
        try:
            value: Any = await asyncio.wait_for(self._redis.get(key), self._timeout)
        except Exception as exc:
            log.warning("cache_unavailable", op="get", error=type(exc).__name__)
            return None
        return value if isinstance(value, bytes) else None

    async def _set(self, key: str, value: bytes, ttl_seconds: int) -> None:
        try:
            await asyncio.wait_for(self._redis.set(key, value, ex=ttl_seconds), self._timeout)
        except Exception as exc:
            log.warning("cache_unavailable", op="set", error=type(exc).__name__)
