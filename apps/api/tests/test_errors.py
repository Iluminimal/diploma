from http import HTTPStatus

from pydantic import BaseModel

from angel.core.config import Settings
from angel.core.errors import ProblemError

from .helpers import running_app


class Payload(BaseModel):
    quantity: int


async def test_unknown_route_is_problem_json(settings: Settings) -> None:
    async with running_app(settings) as (client, _):
        response = await client.get("/nope")

    body = response.json()
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert body["title"] == "Not Found"
    assert body["status"] == 404
    assert body["instance"] == "/nope"
    assert body["request_id"] == response.headers["x-request-id"]


async def test_validation_error_lists_fields_without_echoing_input(settings: Settings) -> None:
    async with running_app(settings) as (client, app):

        async def create(payload: Payload) -> None:
            raise AssertionError("handler must not run for invalid input")

        app.add_api_route("/_test/items", create, methods=["POST"])
        response = await client.post("/_test/items", json={"quantity": "secret-value"})

    body = response.json()
    assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
    assert response.headers["content-type"] == "application/problem+json"
    assert body["errors"][0]["loc"] == ["body", "quantity"]
    assert "secret-value" not in response.text


async def test_problem_error_carries_extensions(settings: Settings) -> None:
    async with running_app(settings) as (client, app):

        async def conflict() -> None:
            raise ProblemError(409, "Out of stock", "Only 2 left.", extensions={"available": 2})

        app.add_api_route("/_test/conflict", conflict)
        response = await client.get("/_test/conflict")

    body = response.json()
    assert response.status_code == 409
    assert body["title"] == "Out of stock"
    assert body["detail"] == "Only 2 left."
    assert body["available"] == 2


async def test_unhandled_exception_is_500_problem_without_leaking(settings: Settings) -> None:
    async with running_app(settings, raise_app_exceptions=False) as (client, app):

        async def boom() -> None:
            raise RuntimeError("database password is hunter2")

        app.add_api_route("/_test/boom", boom)
        response = await client.get("/_test/boom", headers={"X-Request-ID": "trace-500-12345"})

    body = response.json()
    assert response.status_code == 500
    assert response.headers["content-type"] == "application/problem+json"
    assert response.headers["x-request-id"] == "trace-500-12345"
    assert body["request_id"] == "trace-500-12345"
    assert "hunter2" not in response.text
