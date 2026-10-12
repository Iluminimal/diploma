"""Fixed-window rate limiting in Redis, per client address and per limit name.

One Lua script increments the counter and sets its expiry atomically, so a crash between the
two commands can never leave a key that never expires. If Redis is unavailable the request is
allowed (and the failure logged): losing rate limiting must not take search down with it.
"""

import asyncio
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from http import HTTPStatus
from typing import Literal

from fastapi import Request, Response
from redis.asyncio import Redis

from angel.core.config import Settings
from angel.core.errors import ProblemError
from angel.core.logging import get_logger

log = get_logger(__name__)

RATE_LIMITED_TYPE = "urn:angel:problem:rate-limited"
LimitName = Literal[
    "image",
    "text",
    "similar",
    "register",
    "login",
    "refresh",
    "admin",
    "oauth",
    "review",
    "otp_send",
    "otp_verify",
]

_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
"""


@dataclass(frozen=True)
class Rate:
    requests: int
    window_seconds: int

    @classmethod
    def parse(cls, value: str) -> "Rate":
        """`"20/60"` = 20 requests per 60 seconds."""
        requests, _, window = value.partition("/")
        rate = cls(int(requests), int(window))
        if rate.requests < 1 or rate.window_seconds < 1:
            raise ValueError(f"invalid rate limit {value!r}")
        return rate


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    reset_seconds: int


class RateLimiter:
    def __init__(self, redis: Redis, prefix: str, timeout: float) -> None:
        self._redis = redis
        self._prefix = prefix
        self._timeout = timeout

    async def hit(self, name: str, client: str, rate: Rate) -> Decision:
        key = f"{self._prefix}:{name}:{client}"
        try:
            script = self._redis.eval(_SCRIPT, 1, key, str(rate.window_seconds))
            count, ttl = await asyncio.wait_for(script, self._timeout)
        except Exception as exc:
            log.warning("rate_limit_unavailable", error=type(exc).__name__)
            return Decision(True, rate.requests, rate.requests, rate.window_seconds)
        return Decision(
            allowed=int(count) <= rate.requests,
            limit=rate.requests,
            remaining=max(0, rate.requests - int(count)),
            reset_seconds=max(1, int(ttl)),
        )

    async def peek(self, name: str, client: str, rate: Rate) -> Decision:
        """The state of a counter without counting a hit (used for failed-login counters)."""
        key = f"{self._prefix}:{name}:{client}"
        try:
            count, ttl = await asyncio.wait_for(self._peek_script(key), self._timeout)
        except Exception as exc:
            log.warning("rate_limit_unavailable", error=type(exc).__name__)
            return Decision(True, rate.requests, rate.requests, rate.window_seconds)
        return Decision(
            allowed=count < rate.requests,
            limit=rate.requests,
            remaining=max(0, rate.requests - count),
            reset_seconds=max(1, ttl),
        )

    async def _peek_script(self, key: str) -> tuple[int, int]:
        pipe = self._redis.pipeline(transaction=False)
        pipe.get(key)
        pipe.ttl(key)
        raw, ttl = await pipe.execute()
        return int(raw or 0), int(ttl)

    async def reset(self, name: str, client: str) -> None:
        try:
            await asyncio.wait_for(
                self._redis.delete(f"{self._prefix}:{name}:{client}"), self._timeout
            )
        except Exception as exc:
            log.warning("rate_limit_unavailable", error=type(exc).__name__)


def client_address(request: Request, *, trust_proxy_headers: bool) -> str:
    if trust_proxy_headers:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _rate_for(settings: Settings, name: LimitName) -> Rate:
    return Rate.parse(
        {
            "image": settings.rate_limit_image,
            "text": settings.rate_limit_text,
            "similar": settings.rate_limit_similar,
            "register": settings.rate_limit_register,
            "login": settings.rate_limit_login,
            "refresh": settings.rate_limit_refresh,
            "admin": settings.rate_limit_admin,
            "oauth": settings.rate_limit_oauth,
            "review": settings.rate_limit_review,
            "otp_send": settings.rate_limit_otp_send,
            "otp_verify": settings.rate_limit_otp_verify,
        }[name]
    )


def rate_limit(name: LimitName) -> Callable[[Request, Response], Awaitable[None]]:
    """FastAPI dependency: `dependencies=[Depends(rate_limit("image"))]`."""

    async def dependency(request: Request, response: Response) -> None:
        settings: Settings = request.app.state.settings
        if not settings.rate_limit_enabled:
            return
        limiter = RateLimiter(
            request.app.state.redis, settings.rate_limit_prefix, settings.redis_op_timeout_seconds
        )
        client = client_address(request, trust_proxy_headers=settings.trust_proxy_headers)
        decision = await limiter.hit(name, client, _rate_for(settings, name))
        headers = {
            "X-RateLimit-Limit": str(decision.limit),
            "X-RateLimit-Remaining": str(decision.remaining),
            "X-RateLimit-Reset": str(math.ceil(decision.reset_seconds)),
        }
        if not decision.allowed:
            raise ProblemError(
                HTTPStatus.TOO_MANY_REQUESTS,
                "Too many requests",
                f"Limit of {decision.limit} requests exceeded. "
                f"Try again in {decision.reset_seconds} s.",
                type_=RATE_LIMITED_TYPE,
                headers={**headers, "Retry-After": str(decision.reset_seconds)},
            )
        response.headers.update(headers)

    return dependency
