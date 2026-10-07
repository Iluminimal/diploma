import numpy as np
import pytest
from redis.asyncio import Redis
from sqlalchemy import text

from lookalike.repositories.products import SearchFilters
from lookalike.services.cache import SearchCache, normalize_query
from tests.conftest import UNREACHABLE_REDIS_URL, ApiFactory
from tests.fakes import FakeEmbedder

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

TEXT = "/api/v1/search/text"


def test_query_normalization() -> None:
    assert normalize_query("  Red   FLORAL\tDress ") == "red floral dress"


async def test_text_is_embedded_once_per_distinct_query(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=10) as api:
        embedder = api.embedder
        before = embedder.texts_embedded  # start-up warm-up and labels
        first = await api.client.post(TEXT, json={"query": "red floral dress"})
        again = await api.client.post(TEXT, json={"query": "red floral dress"})
        reshaped = await api.client.post(TEXT, json={"query": "  Red   Floral DRESS "})
        other = await api.client.post(TEXT, json={"query": "blue jeans"})

    assert embedder.texts_embedded - before == 2
    assert [r.json()["cached"] for r in (first, again, reshaped, other)] == [
        False,
        True,
        True,
        False,
    ]
    first_ids = [h["product"]["id"] for h in first.json()["results"]]
    assert [h["product"]["id"] for h in again.json()["results"]] == first_ids
    assert [h["product"]["id"] for h in reshaped.json()["results"]] == first_ids


async def test_cached_text_embedding_has_a_ttl_and_the_model_version_in_its_key(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=5, text_embedding_cache_ttl_seconds=600) as api:
        await api.client.post(TEXT, json={"query": "ttl check"})
        redis: Redis = api.app.state.redis
        keys = [k async for k in redis.scan_iter(f"emb:txt:{api.embedder.version}:*")]
        ttl = await redis.ttl(keys[0])
        for key in keys:
            await redis.delete(key)

    assert len(keys) == 1
    assert 0 < ttl <= 600


async def test_a_new_model_version_never_reads_old_vectors(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5) as api:
        await api.client.post(TEXT, json={"query": "shared query"})
        redis: Redis = api.app.state.redis
        old = [k async for k in redis.scan_iter(f"emb:txt:{api.embedder.version}:*")]
        new_embedder = FakeEmbedder(version="fake-other-version")
        cache = SearchCache(
            redis,
            embedding_version=new_embedder.version,
            dimension=512,
            text_ttl_seconds=60,
            similar_ttl_seconds=60,
            timeout_seconds=1.0,
        )

        assert await cache.get_text_embedding("shared query") is None
        for key in old:
            await redis.delete(key)


async def test_corrupt_cache_entries_are_ignored(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5) as api:
        redis: Redis = api.app.state.redis
        cache: SearchCache = api.app.state.search_cache
        await redis.set(cache._text_key("broken"), b"too short", ex=60)
        await redis.set(cache._similar_key(1, SearchFilters(), 12), b"{not json", ex=60)

        assert await cache.get_text_embedding("broken") is None
        assert await cache.get_similar(1, SearchFilters(), 12) is None
        response = await api.client.post(TEXT, json={"query": "broken"})

    assert response.status_code == 200


async def test_text_embedding_round_trips_exactly(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5) as api:
        cache: SearchCache = api.app.state.search_cache
        vector = FakeEmbedder().embed_texts(["round trip"])[0]
        await cache.set_text_embedding("Round  Trip", vector)

        stored = await cache.get_text_embedding("round trip")
        await api.app.state.redis.delete(cache._text_key("round trip"))

    assert stored is not None
    np.testing.assert_array_equal(stored, vector)


async def test_similar_results_are_cached_per_product_limit_and_filters(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=30) as api:
        url = f"/api/v1/products/{api.entries[4].product_id}/similar"
        first = await api.client.get(url, params={"limit": 6})
        second = await api.client.get(url, params={"limit": 6})
        other_limit = await api.client.get(url, params={"limit": 7})
        filtered = await api.client.get(url, params={"limit": 6, "gender": "Men"})
        filtered_again = await api.client.get(url, params={"limit": 6, "gender": "Men"})

    assert [r.json()["cached"] for r in (first, second, other_limit, filtered, filtered_again)] == [
        False,
        True,
        False,
        False,
        True,
    ]
    assert second.json()["results"] == first.json()["results"]
    assert second.json()["timings"]["db_ms"] == 0
    assert filtered_again.json()["results"] == filtered.json()["results"]
    assert filtered.json()["results"] != first.json()["results"]


async def test_similar_cache_entries_expire(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=10, similar_cache_ttl_seconds=300) as api:
        await api.client.get(f"/api/v1/products/{api.entries[0].product_id}/similar")
        redis: Redis = api.app.state.redis
        keys = [k async for k in redis.scan_iter(f"sim:{api.embedder.version}:*")]
        ttl = await redis.ttl(keys[0])
        for key in keys:
            await redis.delete(key)

    assert 0 < ttl <= 300


async def test_search_keeps_working_when_redis_is_down(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=10, redis_url=UNREACHABLE_REDIS_URL) as api:
        entry = api.entries[0]
        text = await api.client.post(TEXT, json={"query": "anything"})
        text_again = await api.client.post(TEXT, json={"query": "anything"})
        similar = await api.client.get(f"/api/v1/products/{entry.product_id}/similar")
        image = await api.client.post(
            "/api/v1/search/image", files={"file": ("a.jpg", entry.jpeg, "image/jpeg")}
        )
        ready = await api.client.get("/readyz")

    assert (text.status_code, similar.status_code, image.status_code) == (200, 200, 200)
    assert text_again.json()["cached"] is False
    assert ready.status_code == 503  # the outage is still reported, just not fatal to search


async def test_catalog_filters_are_cached_and_expire(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=10, catalog_filters_cache_ttl_seconds=120) as api:
        first = await api.client.get("/api/v1/catalog/filters")
        redis: Redis = api.app.state.redis
        key = f"catalog:filters:{api.embedder.version}"
        ttl = await redis.ttl(key)
        # Change the catalogue behind the cache's back: the cached copy is still served.
        engine = api.app.state.engine
        async with engine.begin() as connection:
            await connection.execute(text("UPDATE products SET base_colour = 'Purple'"))
        second = await api.client.get("/api/v1/catalog/filters")
        await redis.delete(key)
        third = await api.client.get("/api/v1/catalog/filters")

    assert 0 < ttl <= 120
    assert second.json() == first.json()
    assert third.json()["colors"] == ["Purple"]
