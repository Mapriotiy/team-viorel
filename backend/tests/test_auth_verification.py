"""Tests for Google identity fields on the user model (Sprint 1)."""

from datetime import datetime, timezone

import pytest

from app.models.user import User


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def make_user(db, username: str | None = None, *, verified=False) -> User:
    user = User(
        google_sub=f"sub-{username or 'user'}",
        email=f"{username or 'user'}@example.com",
        display_name="Some Name",
        avatar_url="https://example.com/a.png",
        leetcode_username=username,
        leetcode_verified_at=_now() if verified else None,
    )
    db.add(user)
    db.commit()
    return user


def test_user_google_fields(db):
    user = make_user(db, "alice")
    assert user.google_sub
    assert user.email
    assert user.display_name
    assert user.avatar_url
    assert user.leetcode_verified_at is None
    assert user.leetcode_username == "alice"


def test_duplicate_google_sub_rejected(db):
    make_user(db, "alice")
    with pytest.raises(Exception):
        second = User(google_sub="sub-alice", leetcode_username="bob")
        db.add(second)
        db.commit()