import asyncio
import json
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import ALGORITHM
from app.db.session import SessionLocal, get_db
from app.models.friend_invite import FriendInvite
from app.models.friend_request import FriendRequest
from app.models.friendship import Friendship
from app.models.notification import Notification
from app.models.user import User
from app.schemas.friends import (
    AcceptInviteResponse,
    CreateInviteResponse,
    FriendResponse,
    FriendUserResponse,
    InviteResponse,
    FriendStreakResponse,
    FriendRequestResponse,
    FriendSearchResponse,
    NotificationResponse,
    TodayFriendStatusResponse,
)

from app.services.activity_sync import get_utc_today
from app.services.leetcode_sync import sync_user_daily_activity_by_id
from app.services.rate_limit import enforce_rate_limit
from app.services.streaks import calculate_friend_streak, get_active_dates
from jwt.exceptions import InvalidTokenError

router = APIRouter()
INVITE_TTL = timedelta(days=7)


def _notification_response(notification: Notification, db: Session) -> NotificationResponse:
    actor = db.get(User, notification.actor_user_id) if notification.actor_user_id else None
    return NotificationResponse(
        id=notification.id,
        notification_type=notification.notification_type,
        actor=user_to_friend_response(actor) if actor else None,
        request_id=notification.request_id,
        payload=notification.payload or {},
        created_at=notification.created_at,
        read_at=notification.read_at,
    )


def _request_response(friend_request: FriendRequest, db: Session) -> FriendRequestResponse:
    requester = db.get(User, friend_request.requester_user_id)
    recipient = db.get(User, friend_request.recipient_user_id)
    return FriendRequestResponse(
        id=friend_request.id,
        requester=user_to_friend_response(requester),
        recipient=user_to_friend_response(recipient),
        status=friend_request.status,
        created_at=friend_request.created_at,
    )


def _invite_expires_at(invite: FriendInvite) -> datetime:
    return invite.expires_at or (invite.created_at + INVITE_TTL)


def _ensure_invite_active(invite: FriendInvite) -> None:
    if invite.status != "pending":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invite is no longer available")
    if _invite_expires_at(invite) <= datetime.now(timezone.utc).replace(tzinfo=None):
        invite.status = "expired"
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite expired")


def normalize_friend_pair(user_id: int, friend_id: int) -> tuple[int, int]:
    return (min(user_id, friend_id), max(user_id, friend_id))


def user_to_friend_response(user: User) -> FriendUserResponse:
    return FriendUserResponse(
        id=user.id,
        leetcode_username=user.leetcode_username,
    )


def build_invite_url(token: str) -> str:
    frontend_url = settings.frontend_url.rstrip("/")
    return f"{frontend_url}/?invite={token}"


@router.post("/invites", response_model=CreateInviteResponse)
def create_invite(
        request: Request,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    enforce_rate_limit(request, "friend-invite", 10, 3600, str(current_user.id))
    token = secrets.token_urlsafe(24)

    invite = FriendInvite(
        inviter_user_id=current_user.id,
        token=token,
        status="pending",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + INVITE_TTL,
    )

    db.add(invite)
    db.commit()
    db.refresh(invite)

    return CreateInviteResponse(
        token=invite.token,
        invite_url=build_invite_url(invite.token),
    )


@router.get("/invites/{token}", response_model=InviteResponse)
def get_invite(
        token: str,
        db: Session = Depends(get_db),
):
    invite = db.query(FriendInvite).filter(FriendInvite.token == token).first()
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )

    inviter = db.get(User, invite.inviter_user_id)
    if inviter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inviter not found",
        )

    return InviteResponse(
        token=invite.token,
        status=invite.status,
        inviter=user_to_friend_response(inviter),
        created_at=invite.created_at,
        expires_at=_invite_expires_at(invite),
    )


@router.post("/invites/{token}/accept", response_model=AcceptInviteResponse)
def accept_invite(
        token: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    invite = db.query(FriendInvite).filter(FriendInvite.token == token).first()
    if invite is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )

    _ensure_invite_active(invite)

    if invite.inviter_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot accept your own invite",
        )

    user_a_id, user_b_id = normalize_friend_pair(
        invite.inviter_user_id,
        current_user.id,
    )

    existing_friendship = (
        db.query(Friendship)
        .filter(
            Friendship.user_a_id == user_a_id,
            Friendship.user_b_id == user_b_id,
            )
        .first()
    )

    if existing_friendship:
        invite.status = "accepted"
        invite.accepted_by_user_id = current_user.id
        invite.accepted_at = datetime.now(timezone.utc)
        db.commit()

        inviter = db.get(User, invite.inviter_user_id)

        return AcceptInviteResponse(
            friendship_id=existing_friendship.id,
            friend=user_to_friend_response(inviter),
        )

    friendship = Friendship(
        user_a_id=user_a_id,
        user_b_id=user_b_id,
    )

    invite.status = "accepted"
    invite.accepted_by_user_id = current_user.id
    invite.accepted_at = datetime.now(timezone.utc)

    db.add(friendship)
    db.commit()
    db.refresh(friendship)

    inviter = db.get(User, invite.inviter_user_id)

    return AcceptInviteResponse(
        friendship_id=friendship.id,
        friend=user_to_friend_response(inviter),
    )


@router.get("/", response_model=list[FriendResponse])
async def list_friends(
        background_tasks: BackgroundTasks,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    friendships = (
        db.query(Friendship)
        .filter(
            or_(
                Friendship.user_a_id == current_user.id,
                Friendship.user_b_id == current_user.id,
                )
        )
        .all()
    )

    friend_ids = [
        friendship.user_b_id
        if friendship.user_a_id == current_user.id
        else friendship.user_a_id
        for friendship in friendships
    ]

    friends = {
        u.id: u
        for u in db.query(User).filter(User.id.in_(friend_ids)).all()
    }

    background_tasks.add_task(sync_user_daily_activity_by_id, current_user.id)
    for fid in friend_ids:
        if fid in friends:
            background_tasks.add_task(sync_user_daily_activity_by_id, fid)

    current_user_dates = get_active_dates(current_user, db)
    today = get_utc_today()

    result: list[FriendResponse] = []

    for friendship in friendships:
        friend = friends.get(
            friendship.user_b_id
            if friendship.user_a_id == current_user.id
            else friendship.user_a_id
        )

        if friend is None:
            continue

        friend_dates = get_active_dates(friend, db)

        streak = calculate_friend_streak(
            user_dates=current_user_dates,
            friend_dates=friend_dates,
            start_date=friendship.created_at.date(),
            today=today,
        )
        result.append(
            FriendResponse(
                friendship_id=friendship.id,
                friend=user_to_friend_response(friend),
                streak=FriendStreakResponse(
                    display_count=streak.display_count,
                    current_count=streak.current_count,
                    longest_count=streak.longest_count,
                    state=streak.state,
                    last_shared_active_date=streak.last_shared_active_date,
                    started_at=streak.started_at,
                    today=TodayFriendStatusResponse(
                        you_active=streak.today.you_active,
                        friend_active=streak.today.friend_active,
                        shared_active=streak.today.shared_active,
                    ),
                ),
            )
        )

    return result


@router.get("/search", response_model=list[FriendSearchResponse])
def search_users(
        request: Request,
        q: str = Query("", min_length=0, max_length=64),
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    query = q.strip()
    enforce_rate_limit(request, "friend-search", 60, 60, str(current_user.id))
    if len(query) < 3:
        return []

    friend_ids = {
        friendship.user_b_id if friendship.user_a_id == current_user.id else friendship.user_a_id
        for friendship in db.query(Friendship).filter(
            or_(Friendship.user_a_id == current_user.id, Friendship.user_b_id == current_user.id),
        ).all()
    }
    pending = db.query(FriendRequest).filter(
        FriendRequest.status == "pending",
        or_(FriendRequest.requester_user_id == current_user.id, FriendRequest.recipient_user_id == current_user.id),
    ).all()
    pending_by_user: dict[int, tuple[str, int]] = {}
    for item in pending:
        other_id = item.recipient_user_id if item.requester_user_id == current_user.id else item.requester_user_id
        pending_by_user[other_id] = ("outgoing" if item.requester_user_id == current_user.id else "incoming", item.id)

    pattern = f"%{query}%"
    users = (
        db.query(User)
        .filter(
            User.id != current_user.id,
            or_(User.leetcode_username.ilike(pattern), User.display_name.ilike(pattern)),
        )
        .order_by(User.leetcode_username.asc(), User.id.asc())
        .limit(20)
        .all()
    )


    result: list[FriendSearchResponse] = []
    for user in users:
        if user.id in friend_ids:
            relation = "friend"
            request_id = None
        elif user.id in pending_by_user:
            relation, request_id = pending_by_user[user.id]
        else:
            relation = "none"
            request_id = None
        result.append(
            FriendSearchResponse(
                id=user.id,
                leetcode_username=user.leetcode_username,
                display_name=user.display_name,
                relation=relation,
                request_id=request_id,
            )
        )
    return result


@router.delete("/invites/{token}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invite(
        token: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    invite = db.query(FriendInvite).filter_by(token=token, inviter_user_id=current_user.id).first()
    if invite is None:
        raise HTTPException(404, "Invite not found")
    if invite.status == "accepted":
        raise HTTPException(409, "Accepted invite cannot be revoked")
    invite.status = "revoked"
    db.commit()


@router.get("/requests", response_model=list[FriendRequestResponse])
def list_friend_requests(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    rows = db.query(FriendRequest).filter(
        FriendRequest.status == "pending",
        or_(FriendRequest.requester_user_id == current_user.id, FriendRequest.recipient_user_id == current_user.id),
    ).order_by(FriendRequest.created_at.desc()).all()
    return [_request_response(row, db) for row in rows]


@router.post("/requests/{user_id}", response_model=FriendRequestResponse, status_code=status.HTTP_201_CREATED)
def create_friend_request(
        user_id: int,
        request: Request,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    enforce_rate_limit(request, "friend-request", 20, 3600, str(current_user.id))
    if user_id == current_user.id:
        raise HTTPException(400, "You cannot add yourself")
    recipient = db.get(User, user_id)
    if recipient is None:
        raise HTTPException(404, "User not found")

    user_a_id, user_b_id = normalize_friend_pair(current_user.id, user_id)
    friendship = db.query(Friendship).filter_by(user_a_id=user_a_id, user_b_id=user_b_id).first()
    if friendship:
        raise HTTPException(409, "Already friends")

    pending = db.query(FriendRequest).filter(
        FriendRequest.status == "pending",
        or_(
            (FriendRequest.requester_user_id == current_user.id) & (FriendRequest.recipient_user_id == user_id),
            (FriendRequest.requester_user_id == user_id) & (FriendRequest.recipient_user_id == current_user.id),
        ),
    ).first()
    if pending:
        raise HTTPException(409, "Friend request already pending")

    friend_request = FriendRequest(
        requester_user_id=current_user.id,
        recipient_user_id=user_id,
        status="pending",
    )
    db.add(friend_request)
    db.flush()
    db.add(
        Notification(
            recipient_user_id=user_id,
            actor_user_id=current_user.id,
            notification_type="friend_request",
            request_id=friend_request.id,
            payload={"username": current_user.leetcode_username or current_user.display_name or "Someone"},
        )
    )
    db.commit()
    db.refresh(friend_request)
    return _request_response(friend_request, db)


@router.post("/requests/{request_id}/accept")
def accept_friend_request(
        request_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    friend_request = db.get(FriendRequest, request_id)
    if friend_request is None or friend_request.recipient_user_id != current_user.id:
        raise HTTPException(404, "Friend request not found")
    if friend_request.status != "pending":
        raise HTTPException(409, "Friend request is no longer pending")

    user_a_id, user_b_id = normalize_friend_pair(friend_request.requester_user_id, current_user.id)
    friendship = db.query(Friendship).filter_by(user_a_id=user_a_id, user_b_id=user_b_id).first()
    if friendship is None:
        friendship = Friendship(user_a_id=user_a_id, user_b_id=user_b_id)
        db.add(friendship)
        db.flush()
    friend_request.status = "accepted"
    friend_request.responded_at = datetime.now(timezone.utc)
    db.query(Notification).filter(
        Notification.request_id == friend_request.id,
        Notification.recipient_user_id == current_user.id,
        Notification.read_at.is_(None),
    ).update({"read_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.add(
        Notification(
            recipient_user_id=friend_request.requester_user_id,
            actor_user_id=current_user.id,
            notification_type="friend_accepted",
            request_id=friend_request.id,
            payload={"username": current_user.leetcode_username or current_user.display_name or "Someone"},
        )
    )
    db.commit()
    return {"status": "accepted", "friendship_id": friendship.id}


@router.post("/requests/{request_id}/decline")
def decline_friend_request(
        request_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    friend_request = db.get(FriendRequest, request_id)
    if friend_request is None or friend_request.recipient_user_id != current_user.id:
        raise HTTPException(404, "Friend request not found")
    if friend_request.status != "pending":
        raise HTTPException(409, "Friend request is no longer pending")
    friend_request.status = "declined"
    friend_request.responded_at = datetime.now(timezone.utc)
    db.query(Notification).filter(
        Notification.request_id == friend_request.id,
        Notification.recipient_user_id == current_user.id,
        Notification.read_at.is_(None),
    ).update({"read_at": datetime.now(timezone.utc)}, synchronize_session=False)
    db.commit()
    return {"status": "declined"}


@router.get("/notifications", response_model=list[NotificationResponse])
def list_notifications(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    rows = db.query(Notification).filter(
        Notification.recipient_user_id == current_user.id,
    ).order_by(Notification.id.desc()).limit(50).all()
    return [_notification_response(row, db) for row in rows]


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
        notification_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    notification = db.query(Notification).filter_by(id=notification_id, recipient_user_id=current_user.id).first()
    if notification is None:
        raise HTTPException(404, "Notification not found")
    notification.read_at = datetime.now(timezone.utc)
    db.commit()


@router.get("/notifications/stream")
async def stream_notifications(
        request: Request,
        token: str = Query(...),
        after_id: int = 0,
        db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if payload.get("scope") != "sse":
            raise InvalidTokenError("Invalid stream scope")
        user_id = int(payload.get("sub"))
    except (InvalidTokenError, TypeError, ValueError):
        raise HTTPException(401, "Invalid token")
    if db.get(User, user_id) is None:
        raise HTTPException(401, "Invalid token")
    db.close()

    async def event_generator():
        last_id = after_id
        while True:
            if await request.is_disconnected():
                return
            session = SessionLocal()
            try:
                rows = session.query(Notification).filter(
                    Notification.recipient_user_id == user_id,
                    Notification.id > last_id,
                ).order_by(Notification.id.asc()).limit(100).all()
                for notification in rows:
                    yield f"event: notification\ndata: {json.dumps(_notification_response(notification, session).model_dump(mode='json'))}\n\n"
                    last_id = notification.id
            finally:
                session.close()
            await asyncio.sleep(2)

    from starlette.responses import StreamingResponse
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/{friendship_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_friend(
        friendship_id: int,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    friendship = db.get(Friendship, friendship_id)

    if friendship is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friendship not found",
        )

    if current_user.id not in (friendship.user_a_id, friendship.user_b_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot delete this friendship",
        )

    db.delete(friendship)
    db.commit()
