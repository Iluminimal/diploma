import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base
from angel.models.mixins import TimestampMixin

ROLE_CUSTOMER = "customer"
ROLE_ADMIN = "admin"


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        # Email жижиг үсгээр хадгалагдана; constraint нь normalize мартсан тохиолдолд зөвхөн том
        # жижиг үсгээр ялгагдах хоёр бүртгэл үүсэхийн оронд ил алдаа гаргана.
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        # Утсыг E.164 (`+` ба 8-15 цифр, тэгээр эхлэхгүй) хэлбэрээр хадгална: нэг дугаар нэг
        # хэлбэртэй тул unique index үнэхээр "нэг утас нэг бүртгэл" гэсэн утгатай.
        CheckConstraint(r"phone ~ '^\+[1-9][0-9]{7,14}$'", name="phone_e164"),
        # Утас эсвэл email, аль нэгийг дараа нь хасаж болно, гэхдээ хоёуланг нь хэзээ ч биш.
        CheckConstraint("email IS NOT NULL OR phone IS NOT NULL", name="contact_present"),
        CheckConstraint(f"role IN ('{ROLE_CUSTOMER}', '{ROLE_ADMIN}')", name="role_valid"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    # Зөвхөн утсаар үүсгэсэн бүртгэлд None (email-ийг дараа нэмж болно).
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    # E.164, жишээ нь "+14155550123". Зөвхөн email-ээр нэвтэрдэг бүртгэлд None.
    phone: Mapped[str | None] = mapped_column(String(16), unique=True)
    # Хаяг/дугаарт илгээсэн нэг удаагийн кодыг баталгаажуулсан хугацаа. Google бүртгэлд
    # тохируулагдана (Google хаягийг баталдаг). None: баталгаажаагүй; нууц үгээр нэвтэрч болно.
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Зөвхөн Google-ээр нэвтэрдэг (мөн Google холбохдоо нууц үгээ хассан) бүртгэлд None: нууц үгээр
    # нэвтрэх нь тэдэнд хэзээ ч амжилтгүй.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    # Google профайл зураг (https URL), header-т харуулахаар хадгална. None бол нэрийн үсэг.
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    # Админ хүсэлт бүрт database-аас уншина, access token-д хэзээ ч хуулахгүй, тиймээс эрхийг
    # хураах нь тэр дороо хүчинтэй болно.
    role: Mapped[str] = mapped_column(String(20), server_default=ROLE_CUSTOMER)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN

    @property
    def identifier(self) -> str:
        """Нэг мөр текст хэрэгтэй газар (log, алдааны тоолуур, захиалгын event-ийн "хэн") бүртгэлийг
        нэрлэх утга: email, байхгүй бол утасны дугаар."""
        return self.email or self.phone or f"user-{self.id}"


class OAuthIdentity(TimestampMixin, Base):
    """Identity provider дахь нэвтрэлт, жишээ нь ("google", Google-ийн тогтвортой `sub`) ->
    хэрэглэгч. Хүнийг email биш subject тодорхойлно: Google бүртгэл хаягаа солиж болно."""

    __tablename__ = "oauth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "subject"),
        Index("ix_oauth_identities_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(20))
    subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(320))


class RefreshToken(TimestampMixin, Base):
    """Олгосон refresh token бүрт нэг мөр. Token хэрэглэх бүрт rotate хийгдэж, family (нэг
    login)-д харьяалагдана. Аль хэдийн ашигласан token ирвэл алдагдсан гэсэн үг: family-г
    бүхэлд нь цуцална."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("ix_refresh_tokens_user_id", "user_id"),
        Index("ix_refresh_tokens_family_id", "family_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "Таны төхөөрөмжүүд" жагсаалтад харагдана. Login-оос family-ийн token бүрт хуулагдана.
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(String(45))
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class OtpChallenge(Base):
    """Утасны дугаар эсвэл email рүү илгээсэн нэг удаагийн код. Зөвхөн кодын HMAC-г хадгална.
    Challenge нэг зорилготой, хугацаатай, цөөн удаа буруу таалтыг зөвшөөрч, эхний зөв оролдлогоор
    ашиглагдаж дуусна."""

    __tablename__ = "otp_challenges"
    __table_args__ = (
        CheckConstraint(
            "purpose IN ('login', 'verify_email', 'verify_phone', 'change_email', "
            "'change_phone', 'reset_password')",
            name="purpose_valid",
        ),
        Index("ix_otp_challenges_destination", "destination", "purpose"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    purpose: Mapped[str] = mapped_column(String(20))
    # Код илгээсэн E.164 дугаар эсвэл жижиг үсгээр бичсэн email.
    destination: Mapped[str] = mapped_column(String(320))
    # Хэний бүртгэл хүссэн (солих/баталгаажуулах урсгал); login, нууц үг сэргээхэд None: хүн
    # нэвтрээгүй тул бүртгэлийг destination-аар олно.
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Address(TimestampMixin, Base):
    __tablename__ = "addresses"
    __table_args__ = (
        CheckConstraint("char_length(country) = 2", name="country_iso_length"),
        Index("ix_addresses_user_id", "user_id"),
        # Хэрэглэгч бүрт default хаяг дээд тал нь нэг, database өөрөө хангана.
        Index(
            "uq_addresses_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    full_name: Mapped[str] = mapped_column(String(120))
    line1: Mapped[str] = mapped_column(String(200))
    line2: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))
    region: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(2))
    phone: Mapped[str | None] = mapped_column(String(30))
    is_default: Mapped[bool] = mapped_column(Boolean, server_default="false")
