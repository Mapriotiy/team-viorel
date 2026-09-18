from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class LobbyMapProvince(Base):
    __tablename__ = "lobby_map_provinces"
    __table_args__ = (UniqueConstraint("lobby_map_id", "province_id", name="uq_lobby_map_province"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lobby_map_id: Mapped[int] = mapped_column(ForeignKey("lobby_maps.id", ondelete="CASCADE"), nullable=False, index=True)
    province_id: Mapped[str] = mapped_column(String, nullable=False)
    region_id: Mapped[str] = mapped_column(String, nullable=False)
    province_name: Mapped[str | None] = mapped_column(String, nullable=True)
    region_name: Mapped[str | None] = mapped_column(String, nullable=True)
    topic_id: Mapped[str | None] = mapped_column(String, nullable=True)
    order_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    problem_title_slug: Mapped[str] = mapped_column(String, nullable=False)
    captured_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    captured_runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    captured_submission_url: Mapped[str | None] = mapped_column(String, nullable=True)
    capturer_leetcode_username: Mapped[str | None] = mapped_column(String, nullable=True)
    first_captured_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    first_captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    fortified_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
