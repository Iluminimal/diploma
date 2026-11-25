from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from angel.core.mongolia import check_region_and_district
from angel.core.phone import InvalidPhoneError, normalize_phone

COUNTRY = "MN"

Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OptionalLine = Annotated[
    str | None, StringConstraints(strip_whitespace=True, max_length=200)
]  # "" гэдэг нь "байхгүй" гэсэн утга
Khoroo = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=40)]
# Монголын шуудангийн код 5 оронтой; олон хүн мэддэггүй тул заавал биш (хоосон = байхгүй).
PostalCode = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^(\d{5})?$")]


def mongolian_phone(value: str) -> str:
    """8 оронтой дотоодын эсвэл +976 дугаарыг E.164 болгоно: хүргэлтийн жолоочид хэрэгтэй тул
    зөвхөн Монголын дугаар хүлээн авна."""
    try:
        e164 = normalize_phone(value, "MN")
    except InvalidPhoneError as error:
        raise ValueError("Монголын утасны дугаар оруулна уу.") from error
    if not e164.startswith("+976"):
        raise ValueError("Монголын утасны дугаар оруулна уу.")
    return e164


class AddressBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ]
    # Аймаг эсвэл нийслэл (`core/mongolia.REGIONS`).
    region: Short
    # Нийслэлд дүүрэг, аймагт сум.
    city: Short
    # Хороо эсвэл баг.
    khoroo: Khoroo = None
    # Гудамж, байр, тоот.
    line1: Line
    # Орц, давхар, хаалганы код зэрэг нэмэлт.
    line2: OptionalLine = None
    postal_code: PostalCode = ""
    country: Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True)] = COUNTRY
    phone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

    @field_validator("country", mode="after")
    @classmethod
    def _only_mongolia(cls, value: str) -> str:
        if value != COUNTRY:
            raise ValueError("Одоогоор зөвхөн Монгол улсад хүргэнэ.")
        return value

    @field_validator("phone", mode="after")
    @classmethod
    def _phone(cls, value: str) -> str:
        return mongolian_phone(value)

    @model_validator(mode="after")
    def _region_and_district(self) -> "AddressBase":
        check_region_and_district(self.region, self.city)
        return self


class AddressIn(AddressBase):
    is_default: bool = False


class AddressUpdate(BaseModel):
    """PATCH: зөвхөн илгээсэн талбарууд өөрчлөгдөнө. Аймаг/дүүргийн хослолыг service нэгтгэсэн
    хаяг дээр шалгана."""

    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[
        str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ] = None
    region: Short | None = None
    city: Short | None = None
    khoroo: Khoroo = None
    line1: Line | None = None
    line2: OptionalLine = None
    postal_code: PostalCode | None = None
    country: Annotated[str | None, StringConstraints(strip_whitespace=True, to_upper=True)] = None
    phone: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1)] = None
    is_default: bool | None = None

    @field_validator("country", mode="after")
    @classmethod
    def _only_mongolia(cls, value: str | None) -> str | None:
        if value is not None and value != COUNTRY:
            raise ValueError("Одоогоор зөвхөн Монгол улсад хүргэнэ.")
        return value

    @field_validator("phone", mode="after")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        return mongolian_phone(value) if value is not None else None


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    region: str | None
    city: str
    khoroo: str | None
    line1: str
    line2: str | None
    postal_code: str
    country: str
    phone: str | None
    is_default: bool


class AddressSnapshot(BaseModel):
    """Захиалга өгөх үеийн хаяг (дараа нь өөрчлөгдсөн ч хэвээр). Хуучин захиалгын snapshot-д
    `khoroo` байхгүй тул default-той."""

    full_name: str
    region: str | None = None
    city: str
    khoroo: str | None = None
    line1: str
    line2: str | None = None
    postal_code: str = ""
    country: str
    phone: str | None = None


class AddressList(BaseModel):
    items: list[AddressOut] = Field(default_factory=list)
