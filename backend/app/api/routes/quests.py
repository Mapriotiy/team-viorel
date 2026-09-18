from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.lobby import Lobby
from app.models.lobby_event import LobbyEvent
from app.models.user import User
from app.models.user_solved import UserSolved
from app.schemas.quests import QuestProgress, QuestsResponse

router = APIRouter()


def _day_start(today) -> datetime:
    return datetime.combine(today, time.min)


def _week_start(today) -> datetime:
    return _day_start(today - timedelta(days=today.weekday()))


def _quest(key: str, title: str, description: str, period: str, progress: int, target: int, reset_at: datetime) -> QuestProgress:
    value = min(target, max(0, progress))
    return QuestProgress(
        key=key,
        title=title,
        description=description,
        period=period,
        progress=value,
        target=target,
        completed=value >= target,
        reset_at=reset_at.replace(tzinfo=timezone.utc),
    )


@router.get("", response_model=QuestsResponse)
def get_quests(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today = now.date()
    day_start = _day_start(today)
    week_start = _week_start(today)
    tomorrow = day_start + timedelta(days=1)
    next_week = week_start + timedelta(days=7)

    daily_solved = db.query(func.count(distinct(UserSolved.title_slug))).filter(
        UserSolved.user_id == current_user.id,
        UserSolved.solved_at >= day_start,
    ).scalar() or 0
    weekly_solved = db.query(func.count(distinct(UserSolved.title_slug))).filter(
        UserSolved.user_id == current_user.id,
        UserSolved.solved_at >= week_start,
    ).scalar() or 0

    capture_types = ("capture", "recapture", "debug_capture")
    daily_captures = db.query(func.count(distinct(LobbyEvent.province_id))).filter(
        LobbyEvent.actor_user_id == current_user.id,
        LobbyEvent.event_type.in_(capture_types),
        LobbyEvent.created_at >= day_start,
    ).scalar() or 0
    weekly_captures = db.query(func.count(distinct(LobbyEvent.province_id))).filter(
        LobbyEvent.actor_user_id == current_user.id,
        LobbyEvent.event_type.in_(capture_types),
        LobbyEvent.created_at >= week_start,
    ).scalar() or 0

    daily = [
        _quest("daily_solve_one", "First solve", "Solve one problem today.", "daily", daily_solved, 1, tomorrow),
        _quest("daily_solve_three", "Warm-up", "Solve three problems today.", "daily", daily_solved, 3, tomorrow),
        _quest("daily_capture_one", "Claim ground", "Capture one territory today.", "daily", daily_captures, 1, tomorrow),
    ]
    weekly = [
        _quest("weekly_solve_ten", "Steady progress", "Solve ten problems this week.", "weekly", weekly_solved, 10, next_week),
        _quest("weekly_capture_five", "Expand the map", "Capture five territories this week.", "weekly", weekly_captures, 5, next_week),
        _quest(
            "weekly_win_one",
            "Take the win",
            "Win one battle this week.",
            "weekly",
            db.query(func.count(Lobby.id)).filter(
                Lobby.winner_id == current_user.id,
                Lobby.finished_at >= week_start,
            ).scalar() or 0,
            1,
            next_week,
        ),
    ]
    return QuestsResponse(daily=daily, weekly=weekly)
