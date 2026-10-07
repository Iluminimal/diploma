from typing import Literal

from pydantic import BaseModel

CheckStatus = Literal["ok", "fail", "not_configured"]


class LivenessResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    status: Literal["ok"] = "ok"
    checks: dict[str, CheckStatus]
