import json

import pytest

from angel.core.config import Settings

from .helpers import running_app


async def test_access_log_is_json_with_request_id(
    settings: Settings, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = settings.model_copy(update={"log_level": "INFO", "log_json": True})
    async with running_app(settings) as (client, _):
        response = await client.get("/healthz", headers={"X-Request-ID": "trace-log-12345"})

    lines = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    access = [line for line in lines if line.get("event") == "request"]

    assert len(access) == 1
    entry = access[0]
    assert entry["request_id"] == response.headers["x-request-id"] == "trace-log-12345"
    assert entry["method"] == "GET"
    assert entry["path"] == "/healthz"
    assert entry["status"] == 200
    assert entry["level"] == "info"
    assert entry["duration_ms"] >= 0
    assert "timestamp" in entry
