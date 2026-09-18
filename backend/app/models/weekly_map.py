from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class WeeklyMap(Base):
    __tablename__ = "weekly_maps"

    __table_args__ = (
        UniqueConstraint("friendship_id", "week_start", name="uq_weekly_map_friendship_week"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    friendship_id: Mapped[int] = mapped_column(
        ForeignKey("friendships.id"),
        nullable=False,
        index=True,
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)