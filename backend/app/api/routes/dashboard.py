from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.daily_activity import DailyActivity
from app.models.user import User
from app.schemas.dashboard import DashboardResponse, TodaySubmissionResponse
from app.services.streaks import (
    calculate_longest_streak,
    calculate_personal_streak,
    get_active_dates,
)
from app.services.activity_sync import sync_user_daily_activity
from app.services.activity_tracking import record_user_activity
from app.services.leetcode_client import LeetCodeClient

router = APIRouter()


def build_activity_calendar(
        current_user: User,
        db: Session,
        today: date,
        days: int = 366,
) -> list[dict]:
    start_date = today - timedelta(days=days - 1)

    rows = (
        db.query(DailyActivity.date, DailyActivity.submissions_count)
        .filter(
            DailyActivity.user_id == current_user.id,
            DailyActivity.date >= start_date,
            DailyActivity.date <= today,
        )
        .all()
    )

    counts_by_date = {row.date: row.submissions_count for row in rows}

    return [
        {
            "date": (start_date + timedelta(days=offset)).isoformat(),
            "count": counts_by_date.get(start_date + timedelta(days=offset), 0),
        }
        for offset in range(days)
    ]


@router.get("/", response_model=DashboardResponse)
async def get_dashboard(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    avatar_url = None
    today_submissions = []
    today = date.today()

    if current_user.leetcode_verified_at is not None and current_user.leetcode_username:
        try:
            profile = await sync_user_daily_activity(current_user, db)
            avatar_url = profile.avatar_url
        except HTTPException:
            pass

        try:
            client = LeetCodeClient()
            recent_submissions = await client.get_recent_accepted_submissions(
                current_user.leetcode_username,
                limit=30,
            )
            seen_problem_slugs: set[str] = set()

            for submission in recent_submissions:
                submitted_date = datetime.fromisoformat(
                    submission.submitted_at,
                ).astimezone().date()

                if submitted_date != today:
                    continue

                if submission.title_slug in seen_problem_slugs:
                    continue

                seen_problem_slugs.add(submission.title_slug)
                today_submissions.append(
                    TodaySubmissionResponse(
                        title=submission.title,
                        title_slug=submission.title_slug,
                        url=submission.url,
                        submitted_at=submission.submitted_at,
                        language=submission.language,
                    )
                )
        except HTTPException:
            pass

    active_dates = get_active_dates(current_user, db)
    personal_streak = calculate_personal_streak(active_dates, today=today)

    record_user_activity(current_user.id, db)

    return DashboardResponse(
        leetcode_username=current_user.leetcode_username,
        display_name=current_user.display_name,
        avatar_url=avatar_url or current_user.avatar_url,
        leetcode_verified_at=(
            current_user.leetcode_verified_at.isoformat()
            if current_user.leetcode_verified_at
            else None
        ),
        current_streak=personal_streak.display_count,
        current_streak_state=personal_streak.state,
        today_active=personal_streak.today_active,
        longest_streak=calculate_longest_streak(active_dates),
        active_days_count=len(active_dates),
        today_submissions=today_submissions,
        activity_calendar=build_activity_calendar(current_user, db, today=today),
    )