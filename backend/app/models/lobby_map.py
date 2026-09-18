from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON
from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LobbyMap(Base):
    __tablename__ = "lobby_maps"
    __table_args__ = (UniqueConstraint("lobby_id", name="uq_lobby_map"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lobby_id: Mapped[int] = mapped_column(ForeignKey("lobbies.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    map_size: Mapped[str] = mapped_column(String, nullable=False, default="medium")
    map_kind: Mapped[str] = mapped_column(String, nullable=False, default="default")
    map_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
