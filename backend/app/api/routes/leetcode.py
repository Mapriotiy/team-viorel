from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.leetcode import (
    LeetCodeLinkStartRequest,
    LeetCodeLinkStatusResponse,
    LeetCodeProfileResponse,
    LeetCodeVerificationResponse,
)
from app.services.leetcode_client import LeetCodeClient
from app.services.leetcode_sync import maybe_sync_user_daily_activity
from app.services.leetcode_verification import (
    MAX_ATTEMPTS,
    active_verification_for,
    cooldown_until,
    latest_verification_for,
    start_verification,
    unlink_verification,
    verify_verification,
)

router = APIRouter()


def _verification_response(verification) -> LeetCodeVerificationResponse:
    return LeetCodeVerificationResponse(
        id=verification.id,
        leetcode_username=verification.leetcode_username,
        problem_slug=verification.problem_slug,
        status=verification.status,
        attempts=verification.attempts,
        max_attempts=MAX_ATTEMPTS,
        created_at=verification.created_at,
        expires_at=verification.expires_at,
        verified_at=verification.verified_at,
        verified_submission_id=verification.verified_submission_id,
        verified_submission_at=verification.verified_submission_at,
        failure_reason=verification.failure_reason,
        cooldown_until=cooldown_until(verification),
    )


@router.get("/profile/{username}", response_model=LeetCodeProfileResponse)
async def get_leetcode_profile(username: str):
    client = LeetCodeClient()
    return await client.get_user_profile(username)


@router.post("/sync/me")
async def sync_my_leetcode_activity(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    profile, _, sync_meta = await maybe_sync_user_daily_activity(current_user, db)

    return {
        "status": sync_meta["status"],
        "synced_days": len(profile.submission_calendar) if profile else 0,
        "next_sync_after": sync_meta["next_sync_after"],
    }


# ── LeetCode account linking ──


@router.post("/link/start", response_model=LeetCodeVerificationResponse)
def link_start(
    payload: LeetCodeLinkStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verification = start_verification(current_user, payload.leetcode_username, db)
    return _verification_response(verification)


@router.post("/link/verify", response_model=LeetCodeVerificationResponse)
async def link_verify(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verification = active_verification_for(current_user.id, db)
    if verification is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active LeetCode verification. Start one first.",
        )
    verification = await verify_verification(current_user, verification, db)
    return _verification_response(verification)


@router.get("/link/status", response_model=LeetCodeLinkStatusResponse)
def link_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verification = latest_verification_for(current_user.id, db)
    return LeetCodeLinkStatusResponse(
        linked=current_user.leetcode_verified_at is not None,
        leetcode_username=current_user.leetcode_username,
        leetcode_verified_at=current_user.leetcode_verified_at,
        verification=(
            _verification_response(verification) if verification else None
        ),
    )


@router.delete("/link")
def link_unlink(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    unlink_verification(current_user, db)
    return {"status": "ok"}
