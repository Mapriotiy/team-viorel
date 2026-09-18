from datetime import datetime, timezone
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LobbyPlayer(Base):
    __tablename__ = "lobby_players"
    __table_args__ = (PrimaryKeyConstraint("lobby_id", "user_id"),)

    lobby_id: Mapped[int] = mapped_column(ForeignKey("lobbies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    faction_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="accepted")
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    powerups: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    granted_regions: Mapped[list | None] = mapped_column(JSON, nullable=True)