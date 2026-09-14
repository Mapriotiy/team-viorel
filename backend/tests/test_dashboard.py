"""Tests for the /health endpoint, dashboard auth, and streak math."""

import asyncio
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.streaks import (
    calculate_current_streak,
    calculate_longest_streak,
    calculate_personal_streak,
    calculate_streak_ending_at,
    get_active_dates,
)
from app.models.daily_activity import DailyActivity
from app.models.user import User


def make_user(db, username: str = "dash_user") -> User:
    user = User(
        google_sub=f"sub-{username}",
        email=f"{username}@example.com",
        display_name="Dash Person",
        avatar_url="https://example.com/a.png",
        leetcode_username=username,
        leetcode_verified_at=None,
    )
    db.add(user)
    db.commit()
    return user


def add_activity(db, user: User, day: date, count: int = 1) -> None:
    db.add(
        DailyActivity(
            user_id=user.id,
            date=day,
            submissions_count=count,
        )
    )
    db.commit()


# ── /health ──


def test_health_check_returns_ok():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_check_supports_head():
    with TestClient(app) as client:
        response = client.head("/api/health")
    assert response.status_code == 200


# ── /dashboard ──


def test_dashboard_requires_auth():
    with TestClient(app) as client:
        response = client.get("/api/dashboard/")
    assert response.status_code == 401


# ── streaks ──


def test_get_active_dates_filters_zero_count(db):
    user = make_user(db)
    today = date(2026, 9, 14)
    add_activity(db, user, today, count=0)
    assert get_active_dates(user, db) == set()


def test_calculate_streak_ending_at_counts_consecutive_days():
    active = {
        date(2026, 9, 14),
        date(2026, 9, 13),
        date(2026, 9, 12),
        date(2026, 9, 10),
    }
    assert calculate_streak_ending_at(active, date(2026, 9, 14)) == 3
    assert calculate_streak_ending_at(active, date(2026, 9, 11)) == 0


def test_calculate_current_streak_uses_today():
    active = {date(2026, 9, 14), date(2026, 9, 13)}
    assert calculate_current_streak(active, today=date(2026, 9, 14)) == 2


def test_personal_streak_lit_when_today_active():
    active = {date(2026, 9, 14), date(2026, 9, 13)}
    streak = calculate_personal_streak(active, today=date(2026, 9, 14))
    assert streak.state == "lit"
    assert streak.today_active is True
    assert streak.display_count == 2


def test_personal_streak_pending_when_yesterday_active():
    active = {date(2026, 9, 13), date(2026, 9, 12)}
    streak = calculate_personal_streak(active, today=date(2026, 9, 14))
    assert streak.state == "pending"
    assert streak.today_active is False
    assert streak.display_count == 2


def test_personal_streak_broken_when_cold():
    streak = calculate_personal_streak(set(), today=date(2026, 9, 14))
    assert streak.state == "broken"
    assert streak.today_active is False
    assert streak.display_count == 0


def test_longest_streak_tracks_runs():
    active = {
        date(2026, 9, 1),
        date(2026, 9, 2),
        date(2026, 9, 3),
        date(2026, 9, 5),
        date(2026, 9, 6),
        date(2026, 9, 7),
        date(2026, 9, 8),
        date(2026, 9, 10),
    }
    assert calculate_longest_streak(active) == 4
    assert calculate_longest_streak(set()) == 0