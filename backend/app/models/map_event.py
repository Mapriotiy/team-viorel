from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class MapEvent(Base):
    """One log line of map history: a capture, recapture, or defense.

    Usernames, problem title, and difficulty are denormalized so feeds can
    render without joins.
    """

    __tablename__ = "map_events"

    __table_args__ = (
        Index("ix_map_events_friendship_id_id", "friendship_id", "id"),
        Index("ix_map_events_weekly_map_id_id", "weekly_map_id", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    friendship_id: Mapped[int] = mapped_column(
        ForeignKey("friendships.id"),
        nullable=False,
    )
    weekly_map_id: Mapped[int] = mapped_column(
        ForeignKey("weekly_maps.id"),
        nullable=False,
    )
    province_id: Mapped[str] = mapped_column(String, nullable=False)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    actor_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    actor_username: Mapped[str] = mapped_column(String, nullable=False)
    previous_owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    previous_owner_username: Mapped[str | None] = mapped_column(String, nullable=True)
    problem_title_slug: Mapped[str] = mapped_column(String, nullable=False)
    problem_title: Mapped[str | None] = mapped_column(String, nullable=True)
    problem_difficulty: Mapped[str | None] = mapped_column(String, nullable=True)
    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow_naive, index=True,
    )
