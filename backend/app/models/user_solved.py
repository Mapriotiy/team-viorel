from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserSolved(Base):
    __tablename__ = "user_solved"

    __table_args__ = (
        UniqueConstraint("user_id", "title_slug", "language", name="uq_user_solved_user_slug_language"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    title_slug: Mapped[str] = mapped_column(String, nullable=False, index=True)
    language: Mapped[str] = mapped_column(String, nullable=False, default="unknown", index=True)
    solved_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    best_runtime_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_submission_url: Mapped[str | None] = mapped_column(String, nullable=True)
    best_runtime_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
