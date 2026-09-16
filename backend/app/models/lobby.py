from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Lobby(Base):
    __tablename__ = "lobbies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)


class LobbyPlayer(Base):
    __tablename__ = "lobby_players"
    __table_args__ = (UniqueConstraint("lobby_id", "user_id", name="uq_lobby_player"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    lobby_id: Mapped[int] = mapped_column(ForeignKey("lobbies.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
