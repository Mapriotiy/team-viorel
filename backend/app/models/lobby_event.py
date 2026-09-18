from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class LobbyEvent(Base):
    """One log line of lobby game history: capture, recapture, defense, etc.

    Usernames, problem title, and difficulty are denormalized so feeds can
    render without joins. province_id doubles as the cell key for board
    modes without a map (e.g. "cell12" in bingo).
    """

    __tablename__ = "lobby_events"

    __table_args__ = (
        Index("ix_lobby_events_lobby_id_id", "lobby_id", "id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lobby_id: Mapped[int] = mapped_column(
        ForeignKey("lobbies.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Null for game-level events (game_won); "cellN" keys for board modes.
    province_id: Mapped[str | None] = mapped_column(String, nullable=True)
    province_name: Mapped[str | None] = mapped_column(String, nullable=True)
    region_name: Mapped[str | None] = mapped_column(String, nullable=True)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    actor_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    actor_username: Mapped[str] = mapped_column(String, nullable=False)
    actor_faction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )
    previous_owner_username: Mapped[str | None] = mapped_column(String, nullable=True)
    problem_title_slug: Mapped[str | None] = mapped_column(String, nullable=True)
    problem_title: Mapped[str | None] = mapped_column(String, nullable=True)
    problem_difficulty: Mapped[str | None] = mapped_column(String, nullable=True)
    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    previous_runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow_naive, index=True,
    )
