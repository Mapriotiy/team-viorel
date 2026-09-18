from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.daily_activity import DailyActivity
from app.models.user import User


def _utc_today() -> date:
    return datetime.now(timezone.utc).date()


@dataclass
class TodayFriendStatus:
    you_active: bool
    friend_active: bool
    shared_active: bool


@dataclass
class FriendStreakStats:
    display_count: int
    current_count: int
    longest_count: int
    state: str
    last_shared_active_date: date | None
    started_at: date
    today: TodayFriendStatus


@dataclass
class PersonalStreakStats:
    display_count: int
    state: str
    today_active: bool


def get_active_dates(user: User, db: Session) -> set[date]:
    rows = (
        db.query(DailyActivity.date)
        .filter(
            DailyActivity.user_id == user.id,
            DailyActivity.submissions_count > 0,
            )
        .all()
    )

    return {row.date for row in rows}


def calculate_streak_ending_at(active_dates: set[date], end_date: date) -> int:
    streak = 0
    current_date = end_date

    while current_date in active_dates:
        streak += 1
        current_date -= timedelta(days=1)

    return streak


def calculate_current_streak(active_dates: set[date], today: date | None = None) -> int:
    if today is None:
        today = _utc_today()

    return calculate_streak_ending_at(active_dates, today)


def calculate_personal_streak(
        active_dates: set[date],
        today: date | None = None,
) -> PersonalStreakStats:
    if today is None:
        today = _utc_today()

    if today in active_dates:
        return PersonalStreakStats(
            display_count=calculate_streak_ending_at(active_dates, today),
            state="lit",
            today_active=True,
        )

    yesterday_count = calculate_streak_ending_at(
        active_dates,
        today - timedelta(days=1),
    )

    if yesterday_count > 0:
        return PersonalStreakStats(
            display_count=yesterday_count,
            state="pending",
            today_active=False,
        )

    return PersonalStreakStats(
        display_count=0,
        state="broken",
        today_active=False,
    )


def calculate_longest_streak(active_dates: set[date]) -> int:
    if not active_dates:
        return 0

    longest = 0
    current = 0
    previous_date: date | None = None

    for active_date in sorted(active_dates):
        if previous_date is None or active_date == previous_date + timedelta(days=1):
            current += 1
        else:
            current = 1

        longest = max(longest, current)
        previous_date = active_date

    return longest


def calculate_friend_streak(
        user_dates: set[date],
        friend_dates: set[date],
        start_date: date,
        today: date | None = None,
) -> FriendStreakStats:
    if today is None:
        today = _utc_today()

    shared_dates = {
        active_date
        for active_date in user_dates & friend_dates
        if active_date >= start_date
    }

    today_shared = today in shared_dates
    yesterday = today - timedelta(days=1)

    if today_shared:
        current_count = calculate_streak_ending_at(shared_dates, today)
        display_count = current_count
        state = "lit"
    else:
        yesterday_count = calculate_streak_ending_at(shared_dates, yesterday)

        if yesterday_count > 0:
            current_count = yesterday_count
            display_count = yesterday_count
            state = "pending"
        else:
            current_count = 0
            display_count = 0
            state = "broken"

    return FriendStreakStats(
        display_count=display_count,
        current_count=current_count,
        longest_count=calculate_longest_streak(shared_dates),
        state=state,
        last_shared_active_date=max(shared_dates) if shared_dates else None,
        started_at=start_date,
        today=TodayFriendStatus(
            you_active=today >= start_date and today in user_dates,
            friend_active=today >= start_date and today in friend_dates,
            shared_active=today_shared,
        ),
    )
