from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.daily_activity import DailyActivity
from app.models.user import User
from app.schemas.leetcode import LeetCodeProfileResponse
from app.services.leetcode_client import LeetCodeClient


async def sync_user_daily_activity(user: User, db: Session) -> LeetCodeProfileResponse:
    client = LeetCodeClient()
    profile = await client.get_user_profile(user.leetcode_username)

    for date_string, submissions_count in profile.submission_calendar.items():
        activity_date = date.fromisoformat(date_string)

        existing_activity = (
            db.query(DailyActivity)
            .filter(
                DailyActivity.user_id == user.id,
                DailyActivity.date == activity_date,
                )
            .first()
        )

        if existing_activity:
            existing_activity.submissions_count = submissions_count
        else:
            db.add(
                DailyActivity(
                    user_id=user.id,
                    date=activity_date,
                    submissions_count=submissions_count,
                )
            )

    recent_submissions = await client.get_recent_accepted_submissions(
        user.leetcode_username,
        limit=30,
    )
    recent_counts_by_date: dict[date, int] = {}

    for submission in recent_submissions:
        submitted_date = datetime.fromisoformat(submission.submitted_at).astimezone().date()
        recent_counts_by_date[submitted_date] = recent_counts_by_date.get(submitted_date, 0) + 1

    for activity_date, submissions_count in recent_counts_by_date.items():
        existing_activity = (
            db.query(DailyActivity)
            .filter(
                DailyActivity.user_id == user.id,
                DailyActivity.date == activity_date,
            )
            .first()
        )

        if existing_activity:
            existing_activity.submissions_count = max(
                existing_activity.submissions_count,
                submissions_count,
            )
        else:
            db.add(
                DailyActivity(
                    user_id=user.id,
                    date=activity_date,
                    submissions_count=submissions_count,
                )
            )

    db.commit()
    return profile