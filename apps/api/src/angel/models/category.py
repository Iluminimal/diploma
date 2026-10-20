from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base
from angel.models.mixins import TimestampMixin


class Category(TimestampMixin, Base):
    """Каталогийн мод: master category > sub category > article type (1-3 түвшин).

    Бараа навч (article type)-ийг зааж, өвөг эцгийг `parent_id`-ээр олно.
    """

    __tablename__ = "categories"
    __table_args__ = (CheckConstraint("level BETWEEN 1 AND 3", name="level_range"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True
    )
    level: Mapped[int] = mapped_column(SmallInteger)
    name: Mapped[str] = mapped_column(String(100))
    slug: Mapped[str] = mapped_column(String(120))
    # Бүтэн slug зам, жишээ нь "apparel/topwear/shirts". Бүх модонд давтагдашгүй.
    path: Mapped[str] = mapped_column(String(400), unique=True)
