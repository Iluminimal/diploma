from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, Index, String, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base


class StaffAuditLog(Base):
    """Ажилтны (админ, агуулахын ажилтан) хийсэн өөрчлөлт бүр: хэн, юу, аль объект дээр, хэзээ.
    Үйлдэлтэй нэг transaction-д бичигддэг тул үйлдэл буцвал мөр ч үлдэхгүй. Зөвхөн нэмэгдэнэ:
    засах, устгах endpoint байхгүй. `actor_label` нь ажилтны бүртгэл устсан ч нэрийг хадгална."""

    __tablename__ = "staff_audit_log"
    __table_args__ = (
        Index("ix_staff_audit_log_created_at", text("created_at DESC")),
        Index("ix_staff_audit_log_actor_created", "actor_id", text("created_at DESC")),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=False), primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_label: Mapped[str] = mapped_column(String(320))
    # "product.create", "product.stock", "order.ship" гэх мэт.
    action: Mapped[str] = mapped_column(String(30))
    entity_type: Mapped[str] = mapped_column(String(20))
    # Бараанд id, захиалгад дугаар.
    entity_id: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
