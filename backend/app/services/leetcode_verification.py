"""LeetCode account linking with Two Sum verification.

A user proves ownership of a LeetCode account by submitting an *Accepted*
Two Sum solution *after* starting a verification session (15-minute window).
A pending session never reserves the username: another user can always start
their own verification for the same username. The username is claimed only at
the moment a verification succeeds (and the unique constraint is the final
arbiter in a race).
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.leetcode_account_verification import LeetCodeAccountVerification
from app.models.user import User
from app.services.leetcode_client import LeetCodeClient

logger = logging.getLogger(__name__)

VERIFICATION_WINDOW_MINUTES = settings.leetcode_verify_window_minutes
VERIFY_COOLDOWN_SECONDS = settings.leetcode_verify_cooldown_seconds
MAX_ATTEMPTS = settings.leetcode_verify_max_attempts
PROBLEM_SLUG = settings.leetcode_verify_problem_slug


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _utc_epoch(value: datetime) -> float:
    """Epoch seconds for a datetime, treating naive values as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).timestamp()
    return value.timestamp()


def cooldown_until(verification: LeetCodeAccountVerification) -> datetime | None:
    if verification.last_attempt_at is None:
        return None
    end = verification.last_attempt_at + timedelta(seconds=VERIFY_COOLDOWN_SECONDS)
    return end if end > _utcnow() else None


def latest_verification_for(user_id: int, db: Session) -> LeetCodeAccountVerification | None:
    return (
        db.query(LeetCodeAccountVerification)
        .filter_by(user_id=user_id)
        .order_by(LeetCodeAccountVerification.id.desc())
        .first()
    )


def active_verification_for(user_id: int, db: Session) -> LeetCodeAccountVerification | None:
    return (
        db.query(LeetCodeAccountVerification)
        .filter_by(user_id=user_id, status="pending")
        .order_by(LeetCodeAccountVerification.id.desc())
        .first()
    )


def start_verification(
    user: User,
    raw_username: str,
    db: Session,
) -> LeetCodeAccountVerification:
    username = raw_username.strip().lower()
    if not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="LeetCode username is required",
        )
    if user.leetcode_verified_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="LeetCode account is already linked",
        )

    taken_by = (
        db.query(User.id)
        .filter(User.leetcode_username == username, User.id != user.id)
        .first()
    )
    if taken_by:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This LeetCode username is already linked to another account",
        )

    db.query(LeetCodeAccountVerification).filter(
        LeetCodeAccountVerification.user_id == user.id,
        LeetCodeAccountVerification.status == "pending",
    ).update({"status": "expired"})
    db.flush()

    now = _utcnow()
    verification = LeetCodeAccountVerification(
        user_id=user.id,
        leetcode_username=username,
        problem_slug=PROBLEM_SLUG,
        status="pending",
        attempts=0,
        created_at=now,
        expires_at=now + timedelta(minutes=VERIFICATION_WINDOW_MINUTES),
    )
    db.add(verification)
    db.commit()
    db.refresh(verification)
    return verification


async def verify_verification(
    user: User,
    verification: LeetCodeAccountVerification,
    db: Session,
) -> LeetCodeAccountVerification:
    """Run one verification attempt against the current LeetCode account."""
    now = _utcnow()

    if verification.status == "verified":
        return verification
    if verification.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Verification session is {verification.status}; start a new one",
        )

    if verification.expires_at < now:
        verification.status = "expired"
        verification.failure_reason = "Verification window expired"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification window expired. Start a new verification.",
        )

    if verification.attempts >= MAX_ATTEMPTS:
        verification.status = "failed"
        verification.failure_reason = "Maximum verification attempts reached"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum verification attempts reached. Start a new verification.",
        )

    cd_until = cooldown_until(verification)
    if cd_until is not None:
        retry_after = max(1, int((cd_until - now).total_seconds()))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {retry_after}s before verifying again",
        )

    client = LeetCodeClient()
    try:
        submissions = await client.get_recent_accepted_submissions(
            verification.leetcode_username,
            limit=30,
        )
    except HTTPException:
        raise

    created_ts = _utc_epoch(verification.created_at)
    expires_ts = _utc_epoch(verification.expires_at)

    match = None
    for submission in submissions:
        submitted_at = datetime.fromisoformat(submission.submitted_at)
        submitted_ts = _utc_epoch(submitted_at)
        if (
            submission.title_slug == verification.problem_slug
            and created_ts <= submitted_ts <= expires_ts
        ):
            match = submission
            break

    verification.last_attempt_at = now
    verification.attempts += 1

    if match is not None:
        verification.status = "verified"
        verification.verified_at = now
        verification.verified_submission_id = match.submission_id
        verification.verified_submission_at = _to_naive_utc(
            datetime.fromisoformat(match.submitted_at)
        )
        verification.failure_reason = None

        user.leetcode_username = verification.leetcode_username
        user.leetcode_verified_at = now

        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            logger.warning(
                "Verification race: %s claimed by another user",
                verification.leetcode_username,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This LeetCode username was just linked to another account",
            )
        db.refresh(verification)
        return verification

    if verification.attempts >= MAX_ATTEMPTS:
        verification.status = "failed"
        verification.failure_reason = "Maximum verification attempts reached"
    db.commit()
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=(
            "No accepted Two Sum submission found in the verification window. "
            "Submit an Accepted solution for Two Sum on this LeetCode account "
            "after starting verification, then try again."
        ),
    )


def unlink_verification(user: User, db: Session) -> None:
    db.query(LeetCodeAccountVerification).filter(
        LeetCodeAccountVerification.user_id == user.id,
        LeetCodeAccountVerification.status == "pending",
    ).update({"status": "expired"})
    user.leetcode_username = None
    user.leetcode_verified_at = None
    db.commit()
