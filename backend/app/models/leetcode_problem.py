from datetime import datetime, timezone

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LeetCodeProblem(Base):
    __tablename__ = "leetcode_problems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    frontend_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    title_slug: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    difficulty: Mapped[str] = mapped_column(String, nullable=False)
    topic_tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)