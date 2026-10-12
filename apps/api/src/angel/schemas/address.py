from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OptionalLine = Annotated[
    str | None, StringConstraints(strip_whitespace=True, max_length=200)
]  # "" means "none"
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9+()\-. ]{5,30}$")]


class AddressBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ]
    line1: Line
    line2: OptionalLine = None
    city: Short
    region: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=100)] = None
    postal_code: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=20)
    ]
    country: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z]{2}$")]
    phone: Phone | None = None

    @field_validator("country", mode="after")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.upper()


class AddressIn(AddressBase):
    is_default: bool = False


class AddressUpdate(BaseModel):
    """PATCH: only the fields that are sent change."""

    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] = None
    line1: Line | None = None
    line2: OptionalLine = None
    city: Short | None = None
    region: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=100)] = None
    postal_code: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=2, max_length=20)
    ] = None
    country: Annotated[
        str | None, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z]{2}$")
    ] = None
    phone: Phone | None = None
    is_default: bool | None = None

    @field_validator("country", mode="after")
    @classmethod
    def _upper(cls, value: str | None) -> str | None:
        return value.upper() if value else value


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    line1: str
    line2: str | None
    city: str
    region: str | None
    postal_code: str
    country: str
    phone: str | None
    is_default: bool


class AddressSnapshot(BaseModel):
    """An address as it was when the order was placed."""

    full_name: str
    line1: str
    line2: str | None = None
    city: str
    region: str | None = None
    postal_code: str
    country: str
    phone: str | None = None


class AddressList(BaseModel):
    items: list[AddressOut] = Field(default_factory=list)
