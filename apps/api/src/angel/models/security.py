from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base

# Бүртгэгддэг үйл явдлууд (`type`).
LOGIN = "login"
LOGIN_FAILED = "login_failed"
NEW_DEVICE = "new_device"
PASSWORD_CHANGED = "password_changed"  # noqa: S105 - үйл явдлын нэр, нууц үг биш
PASSWORD_RESET = "password_reset"  # noqa: S105
SESSIONS_REVOKED = "sessions_revoked"
EMAIL_CHANGED = "email_changed"
PHONE_CHANGED = "phone_changed"


class SecurityEvent(Base):
    """Бүртгэлийн аюулгүй байдалд хамаатай үйл явдал (нэвтрэлт, амжилтгүй оролдлого, нууц үг солих,
    төхөөрөмж цуцлах...): эзэн "миний бүртгэлд юу болсон бэ" гэж харна. Үйлдэлтэй нэг
    transaction-д бичигддэг. Зөвхөн нэмэгдэнэ; бүртгэл устахад хамт устна."""

    __tablename__ = "security_events"
    __table_args__ = (Index("ix_security_events_user_created", "user_id", text("created_at DESC")),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(20))
    # Нэвтрэлтийн арга: "password", "otp", "google"; бусад үед None.
    method: Mapped[str | None] = mapped_column(String(10))
    ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
