from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Google identity: who this user is in our app.
    google_sub: Mapped[str | None] = mapped_column(
        String, unique=True, index=True, nullable=True,
    )
    email: Mapped[str | None] = mapped_column(
        String, unique=True, index=True, nullable=True,
    )
    display_name: Mapped[str | None] = mapped_column(String, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String, nullable=True)

    # LeetCode profile: which external profile to sync solves from.
    # Only set after the account is verified (a fresh Accepted Two Sum submit).
    leetcode_username: Mapped[str | None] = mapped_column(
        String, unique=True, index=True, nullable=True,
    )
    leetcode_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True,
    )

    # Moderation / roles.
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_banned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
