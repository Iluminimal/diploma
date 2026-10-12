from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from angel.db.base import Base
from angel.models.mixins import TimestampMixin


class Category(TimestampMixin, Base):
    """Catalogue tree: master category > sub category > article type (levels 1-3).

    Products point at the leaf (article type); ancestors are reached through `parent_id`.
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
    # Full slug path, e.g. "apparel/topwear/shirts". Unique across the whole tree.
    path: Mapped[str] = mapped_column(String(400), unique=True)
