"""Аюулгүй толгой, CSP зөрчлийн мэдээлэл хүлээн авах endpoint."""

import json

import pytest

from angel.api.v1.system.security import _clip, _summaries
from tests.conftest import ApiFactory

pytestmark = [pytest.mark.integration, pytest.mark.usefixtures("require_infra")]

REPORT = "/api/v1/security/csp-report"


def violations(captured: str) -> list[dict[str, object]]:
    """Log JSON-ийн мөрүүдээс csp_violation-уудыг (structlog cache хийдэг тул stdout-оос уншина)."""
    entries = []
    for line in captured.splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if entry.get("event") == "csp_violation":
            entries.append(entry)
    return entries


LEGACY = {
    "csp-report": {
        "violated-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js?token=secret#frag",
        "document-uri": "https://shop.example/account?code=123",
        "source-file": "https://shop.example/app.js",
        "line-number": 12,
    }
}
MODERN = [
    {
        "type": "csp-violation",
        "body": {
            "effectiveDirective": "img-src",
            "blockedURL": "inline",
            "documentURL": "https://shop.example/",
        },
    }
]


async def test_every_api_response_carries_the_security_headers(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        ok = await api.client.get("/healthz")
        problem = await api.client.get("/api/v1/products/999999")

    for response in (ok, problem):
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["cross-origin-resource-policy"] == "same-site"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert "camera=()" in response.headers["permissions-policy"]
        assert response.headers["content-security-policy"] == (
            "default-src 'none'; frame-ancestors 'none'"
        )


async def test_the_interactive_docs_keep_working_without_the_csp(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        docs = await api.client.get("/api/v1/docs")

    assert docs.status_code == 200
    assert "content-security-policy" not in docs.headers
    assert docs.headers["x-frame-options"] == "DENY"


async def test_hsts_only_over_https_deployments(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as plain:
        without = await plain.client.get("/healthz")
    async with api_factory(seed_count=0, cookie_secure=True) as secure:
        with_hsts = await secure.client.get("/healthz")

    assert "strict-transport-security" not in without.headers
    assert with_hsts.headers["strict-transport-security"] == "max-age=63072000; includeSubDomains"


@pytest.mark.parametrize("content_type", ["application/csp-report", "application/reports+json"])
async def test_a_violation_report_is_accepted_and_logged_without_query_strings(
    api_factory: ApiFactory, content_type: str, capsys: pytest.CaptureFixture[str]
) -> None:
    payload = LEGACY if content_type == "application/csp-report" else MODERN
    async with api_factory(seed_count=0) as api:
        capsys.readouterr()
        response = await api.client.post(
            REPORT, content=json.dumps(payload), headers={"content-type": content_type}
        )

    assert response.status_code == 204
    assert response.content == b""
    captured = capsys.readouterr().out
    assert len(violations(captured)) == 1
    assert "secret" not in captured
    assert "code=123" not in captured


async def test_garbage_is_ignored_quietly(
    api_factory: ApiFactory, capsys: pytest.CaptureFixture[str]
) -> None:
    async with api_factory(seed_count=0) as api:
        capsys.readouterr()
        not_json = await api.client.post(
            REPORT, content=b"{{{", headers={"content-type": "text/plain"}
        )
        wrong_shape = await api.client.post(REPORT, json={"hello": "world"})

    assert (not_json.status_code, wrong_shape.status_code) == (204, 204)
    assert violations(capsys.readouterr().out) == []


async def test_an_oversized_report_is_refused(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0) as api:
        response = await api.client.post(REPORT, content=b"x" * 9000)

    assert response.status_code == 413


async def test_the_report_endpoint_is_rate_limited(api_factory: ApiFactory) -> None:
    async with api_factory(seed_count=0, rate_limit_csp_report="2/60") as api:
        codes = [(await api.client.post(REPORT, json=LEGACY)).status_code for _ in range(3)]

    assert codes == [204, 204, 429]


def test_summaries_read_both_formats_and_cap_the_list() -> None:
    assert _summaries(LEGACY)[0]["directive"] == "script-src-elem"
    assert _summaries(MODERN)[0]["directive"] == "img-src"
    assert len(_summaries(MODERN * 30)) == 10
    assert _summaries("nonsense") == []


def test_clip_drops_query_and_fragment_and_long_text() -> None:
    assert _clip("https://a.example/p?x=1#y") == "https://a.example/p"
    assert _clip("inline") == "inline"
    assert _clip("x" * 500) == "x" * 200
    assert _clip(None) is None
