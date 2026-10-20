import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
# Зөвхөн урт нь дүрэм: найрлагын дүрэм ("нэг цифр, нэг тэмдэгт") хүмүүсийг сул, таамаглахад амархан
# нууц үг сонгоход түлхдэг. 10 тэмдэгт доод хязгаар, 128 нь hash хийх хугацааг хязгаарлана.
Password = Annotated[str, Field(min_length=10, max_length=128)]


def _normalise_email(value: str) -> str:
    return value.strip().lower()


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: Password
    full_name: FullName

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return _normalise_email(value)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # EmailStr биш, дээд хязгаараас бусад урт шалгахгүй: буруу хэлбэртэй хаяг нь буруу нууц үгтэй
    # ижил байдлаар (өөр алдаа үзүүлэхгүйгээр) амжилтгүй болох ёстой.
    email: Annotated[str, Field(min_length=1, max_length=320)]
    password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("email", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return _normalise_email(value)


class UserOut(BaseModel):
    id: int
    # Утасны дугаараар бүртгүүлсэн хэрэглэгчид email нэмэх хүртэл email байхгүй, эсрэгээр нь мөн
    # адил.
    email: str | None
    phone: str | None
    email_verified: bool
    phone_verified: bool
    full_name: str
    role: Literal["customer", "admin"]
    avatar_url: str | None
    # Зөвхөн Google-ээр нэвтэрдэг бүртгэлд False (профайл хуудсан дээр нэмж болно).
    has_password: bool
    # Бүртгэлд холбогдсон нэвтрэх provider-ууд, жишээ нь ["google"].
    providers: list[str]


class UpdateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: FullName


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Бүртгэл нууц үгтэй бол заавал; зөвхөн Google-ийн бүртгэл үүнийг орхино.
    current_password: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    new_password: Password


class DeleteAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Бүртгэлийн email (email байхгүй бол утасны дугаар)-ыг хэрэглэгч өөрөө дахин бичнэ: ингэвэл
    # орхигдсон tab-аас нэг товшилтоор бүртгэл устгах боломжгүй.
    confirm: Annotated[str, Field(min_length=1, max_length=320)]
    password: Annotated[str, Field(min_length=1, max_length=128)] | None = None

    @field_validator("confirm", mode="after")
    @classmethod
    def _lower(cls, value: str) -> str:
        return _normalise_email(value)


class SessionOut(BaseModel):
    """Access token нь `Authorization: Bearer`-д очиж, client-ийн санах ойд хадгалагдана. Refresh
    token хариуны body-д хэзээ ч гарахгүй: httpOnly cookie байна."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth scheme name
    expires_in: int
    user: UserOut
    # Энэ нэвтрэлтээр бүртгэл дөнгөж үүссэн бол True (шинэ утасны дугаар эсвэл email): тэгвэл хуудас
    # нэр асууна.
    is_new_user: bool = False


class ProvidersOut(BaseModel):
    """Нууц үгээс гадна ямар нэвтрэх арга боломжтой вэ: хуудас зөвхөн тэдгээрийг харуулна."""

    google: bool


Destination = Annotated[str, Field(min_length=3, max_length=320)]
OtpCode = Annotated[str, Field(pattern=r"^[0-9]{6}$")]


class OtpRequest(BaseModel):
    """Нэвтрэх код хүсэх. `destination` нь утасны дугаар (ямар ч түгээмэл бичлэг) эсвэл email."""

    model_config = ConfigDict(extra="forbid")

    destination: Destination


class OtpVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: Destination
    code: OtpCode


CurrentPassword = Annotated[str, Field(min_length=1, max_length=128)] | None


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: Destination


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    destination: Destination
    code: OtpCode
    new_password: Password


class VerifyCodeRequest(BaseModel):
    """Нэвтэрсэн хэрэглэгчийн өөрт байгаа хаяг эсвэл дугаарыг баталгаажуулах код."""

    model_config = ConfigDict(extra="forbid")

    code: OtpCode


class PhoneChangeRequest(BaseModel):
    """Утасны дугаар нэмэх эсвэл одоогийхыг солих: код шинэ дугаар руу илгээгдэнэ."""

    model_config = ConfigDict(extra="forbid")

    phone: Annotated[str, Field(min_length=3, max_length=40)]
    # Бүртгэл нууц үгтэй бол заавал.
    current_password: CurrentPassword = None


class PhoneConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: Annotated[str, Field(min_length=3, max_length=40)]
    code: OtpCode


class EmailChangeRequest(BaseModel):
    """Email хаяг нэмэх эсвэл одоогийхыг солих: код шинэ хаяг руу илгээгдэнэ."""

    model_config = ConfigDict(extra="forbid")

    email: Annotated[str, Field(min_length=3, max_length=320)]
    current_password: CurrentPassword = None


class EmailConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: Annotated[str, Field(min_length=3, max_length=320)]
    code: OtpCode


class RemoveContactRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: CurrentPassword = None


class DeviceSession(BaseModel):
    """Бүртгэлийн нээлттэй нэг нэвтрэлт, "миний төхөөрөмжүүд" жагсаалтад харагддаг хэлбэрээр."""

    id: uuid.UUID
    device: str
    ip: str | None
    created_at: datetime
    last_used_at: datetime
    # Энэ хүсэлтийг илгээсэн нэвтрэлт.
    current: bool
