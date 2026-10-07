from pydantic import BaseModel, ConfigDict


class FieldError(BaseModel):
    loc: list[str]
    msg: str
    type: str


class ProblemDetail(BaseModel):
    """RFC 7807 problem details. Extension members (e.g. `checks`) are allowed."""

    model_config = ConfigDict(extra="allow")

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    request_id: str | None = None
    errors: list[FieldError] | None = None
