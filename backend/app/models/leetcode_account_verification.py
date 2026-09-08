from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class LeetCodeAccountVerification(Base):
    """A LeetCode account linking session.

    Ownership is only claimed on a successful verification; a pending session
    for one user never blocks another user from starting their own.
    """

    __tablename__ = "leetcode_account_verifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True,
    )
    leetcode_username: Mapped[str] = mapped_column(String, nullable=False)
    problem_slug: Mapped[str] = mapped_column(
        String, nullable=False, default="two-sum",
    )
    status: Mapped[str] = mapped_column(
        String, nullable=False, default="pending", index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    verified_submission_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verified_submission_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
