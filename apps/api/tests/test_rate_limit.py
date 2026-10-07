import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest
from redis.asyncio import Redis

from lookalike.core.config import Settings
from lookalike.core.rate_limit import Rate, RateLimiter
from tests.conftest import UNREACHABLE_REDIS_URL, ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

TEXT = "/api/v1/search/text"
BODY = {"query": "red dress"}


@pytest.fixture
async def limiter(settings: Settings) -> AsyncIterator[RateLimiter]:
    redis = Redis.from_url(settings.redis_url)
    yield RateLimiter(redis, f"rl-unit-{uuid.uuid4().hex[:8]}", timeout=1.0)
    await redis.aclose()


def test_rate_parsing() -> None:
    assert Rate.parse("20/60") == Rate(20, 60)
    for bad in ("", "20", "0/60", "20/0", "a/b", "-1/10"):
        with pytest.raises(ValueError, match=r"invalid|literal"):
            Rate.parse(bad)


async def test_allows_up_to_the_limit_then_denies(limiter: RateLimiter) -> None:
    rate = Rate(3, 60)

    decisions = [await limiter.hit("image", "1.2.3.4", rate) for _ in range(5)]

    assert [d.allowed for d in decisions] == [True, True, True, False, False]
    assert [d.remaining for d in decisions] == [2, 1, 0, 0, 0]
    assert all(d.limit == 3 for d in decisions)
    assert 1 <= decisions[-1].reset_seconds <= 60


async def test_clients_and_limit_names_are_counted_separately(limiter: RateLimiter) -> None:
    rate = Rate(1, 60)

    assert (await limiter.hit("image", "a", rate)).allowed
    assert not (await limiter.hit("image", "a", rate)).allowed
    assert (await limiter.hit("image", "b", rate)).allowed
    assert (await limiter.hit("text", "a", rate)).allowed


async def test_the_window_expires(limiter: RateLimiter) -> None:
    rate = Rate(1, 1)

    assert (await limiter.hit("image", "a", rate)).allowed
    assert not (await limiter.hit("image", "a", rate)).allowed
    await asyncio.sleep(1.2)

    assert (await limiter.hit("image", "a", rate)).allowed


async def test_concurrent_requests_are_counted_exactly(limiter: RateLimiter) -> None:
    rate = Rate(10, 60)

    decisions = await asyncio.gather(*(limiter.hit("image", "a", rate) for _ in range(40)))

    assert sum(d.allowed for d in decisions) == 10


async def test_a_dead_redis_allows_the_request() -> None:
    dead = RateLimiter(Redis.from_url(UNREACHABLE_REDIS_URL), "rl", timeout=0.2)

    decision = await dead.hit("image", "a", Rate(1, 60))

    assert decision.allowed


async def test_api_returns_429_problem_with_retry_after(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5, rate_limit_text="3/60") as api:
        responses = [await api.client.post(TEXT, json=BODY) for _ in range(5)]

    assert [r.status_code for r in responses] == [200, 200, 200, 429, 429]
    ok, blocked = responses[0], responses[3]
    assert ok.headers["x-ratelimit-limit"] == "3"
    assert [r.headers["x-ratelimit-remaining"] for r in responses[:3]] == ["2", "1", "0"]
    assert blocked.headers["content-type"] == "application/problem+json"
    assert blocked.json()["type"] == "urn:lookalike:problem:rate-limited"
    assert 1 <= int(blocked.headers["retry-after"]) <= 60
    assert blocked.headers["x-ratelimit-remaining"] == "0"
    assert blocked.json()["request_id"] == blocked.headers["x-request-id"]


async def test_endpoints_have_independent_limits(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5, rate_limit_text="1/60", rate_limit_similar="1/60") as api:
        entry = api.entries[0]
        files = {"file": ("a.jpg", entry.jpeg, "image/jpeg")}
        text_1 = await api.client.post(TEXT, json=BODY)
        text_2 = await api.client.post(TEXT, json=BODY)
        image = await api.client.post("/api/v1/search/image", files=files)
        similar_1 = await api.client.get(f"/api/v1/products/{entry.product_id}/similar")
        similar_2 = await api.client.get(f"/api/v1/products/{entry.product_id}/similar")
        listing = [await api.client.get("/api/v1/products") for _ in range(3)]

    assert (text_1.status_code, text_2.status_code) == (200, 429)
    assert image.status_code == 200
    assert (similar_1.status_code, similar_2.status_code) == (200, 429)
    assert [r.status_code for r in listing] == [200, 200, 200]  # browsing is not limited


async def test_rejected_uploads_count_against_the_limit(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5, rate_limit_image="2/60") as api:
        bad = {"file": ("a.txt", b"hello", "text/plain")}
        codes = [(await api.client.post("/api/v1/search/image", files=bad)).status_code]
        codes += [(await api.client.post("/api/v1/search/image", files=bad)).status_code]
        codes += [(await api.client.post("/api/v1/search/image", files=bad)).status_code]

    assert codes == [415, 415, 429]


async def test_forwarded_header_is_ignored_unless_the_proxy_is_trusted(
    api_factory: ApiFactory,
) -> None:
    async with api_factory(seed_count=5, rate_limit_text="1/60") as api:
        first = await api.client.post(TEXT, json=BODY, headers={"x-forwarded-for": "9.9.9.1"})
        spoofed = await api.client.post(TEXT, json=BODY, headers={"x-forwarded-for": "9.9.9.2"})
    async with api_factory(seed_count=5, rate_limit_text="1/60", trust_proxy_headers=True) as api:
        a = await api.client.post(TEXT, json=BODY, headers={"x-forwarded-for": "9.9.9.1, 10.0.0.1"})
        b = await api.client.post(TEXT, json=BODY, headers={"x-forwarded-for": "9.9.9.2"})
        a_again = await api.client.post(TEXT, json=BODY, headers={"x-forwarded-for": "9.9.9.1"})

    assert (first.status_code, spoofed.status_code) == (200, 429)  # cannot dodge by lying
    assert (a.status_code, b.status_code, a_again.status_code) == (200, 200, 429)


async def test_rate_limiting_can_be_disabled(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=5, rate_limit_text="1/60", rate_limit_enabled=False) as api:
        responses = [await api.client.post(TEXT, json=BODY) for _ in range(4)]

    assert [r.status_code for r in responses] == [200] * 4
    assert "x-ratelimit-limit" not in responses[0].headers
