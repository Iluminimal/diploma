from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

EntityType = Literal["product", "order"]


class AuditListQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actor_id: Annotated[int | None, Field(ge=1)] = None
    entity_type: EntityType | None = None
    action: Annotated[
        str | None, Field(min_length=3, max_length=30, pattern=r"^[a-z]+\.[a-z]+$")
    ] = None
    page: Annotated[int, Field(ge=1, le=10_000)] = 1
    page_size: Annotated[int, Field(ge=1, le=100)] = 25


class AuditEntry(BaseModel):
    id: int
    actor_id: int | None
    actor_label: str
    action: str
    entity_type: str
    entity_id: str
    data: dict[str, Any]
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditEntry]
    total: int
    page: int
    page_size: int
    pages: int
