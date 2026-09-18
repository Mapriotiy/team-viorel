from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.user_activity import UserActivity


def record_user_activity(user_id: int, db: Session) -> None:
    """Mark the user active for today (idempotent, one row per user per day)."""
    today = datetime.now(timezone.utc).date()
    exists = (
        db.query(UserActivity.id)
        .filter_by(user_id=user_id, date=today)
        .first()
    )
    if exists:
        return
    db.add(UserActivity(user_id=user_id, date=today))
    db.commit()
