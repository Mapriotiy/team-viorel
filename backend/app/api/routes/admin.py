from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.api.routes.lobby import _delete_lobby_with_children
from app.models.daily_activity import DailyActivity
from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby import Lobby
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.models.user_activity import UserActivity
from app.schemas.admin import (
    AdminLobbyListResponse,
    AdminLobbyOut,
    AdminStatsResponse,
    AdminUserListResponse,
    AdminUserOut,
    AdminUserUpdate,
)

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        google_sub=user.google_sub,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        leetcode_username=user.leetcode_username,
        leetcode_verified_at=user.leetcode_verified_at,
        is_admin=user.is_admin,
        is_banned=user.is_banned,
        created_at=user.created_at,
    )


@router.get("/users", response_model=AdminUserListResponse)
def list_users(
    q: str | None = Query(default=None, max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(User)
    if q:
        term = q.strip()
        like = f"%{term}%"
        filters = [
            User.display_name.ilike(like),
            User.email.ilike(like),
            User.leetcode_username.ilike(like),
            User.google_sub.ilike(like),
        ]
        if term.isdigit():
            filters.append(User.id == int(term))
        query = query.filter(or_(*filters))
    total = query.count()
    users = (
        query.order_by(User.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return AdminUserListResponse(
        total=total,
        offset=offset,
        limit=limit,
        users=[_to_out(u) for u in users],
    )


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    payload: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot modify your own account")

    if payload.is_admin is False and target.is_admin:
        admin_count = db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")

    if payload.is_admin is not None:
        target.is_admin = payload.is_admin
    if payload.is_banned is not None:
        target.is_banned = payload.is_banned

    db.commit()
    db.refresh(target)
    return _to_out(target)


@router.post("/users/{user_id}/reset-leetcode", response_model=AdminUserOut)
def reset_leetcode(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    target.leetcode_username = None
    target.leetcode_verified_at = None
    db.commit()
    db.refresh(target)
    return _to_out(target)


def _lobby_to_out(lobby: Lobby, db: Session) -> AdminLobbyOut:
    creator = db.get(User, lobby.creator_id)
    creator_name = (
        creator.display_name
        or creator.leetcode_username
        or f"user #{creator.id}"
        if creator
        else None
    )
    winner_name = None
    if lobby.winner_id is not None:
        winner = db.get(User, lobby.winner_id)
        if winner:
            winner_name = winner.display_name or winner.leetcode_username or f"user #{winner.id}"
    elif lobby.winner_faction_id is not None:
        winner_name = f"Faction {lobby.winner_faction_id}"

    player_count = (
        db.query(func.count(LobbyPlayer.user_id))
        .filter(LobbyPlayer.lobby_id == lobby.id)
        .scalar()
    )
    return AdminLobbyOut(
        id=lobby.id,
        name=lobby.name,
        status=lobby.status,
        game_mode=lobby.game_mode,
        map_size=lobby.map_size,
        max_players=lobby.max_players,
        faction_mode=lobby.faction_mode,
        player_count=player_count,
        creator_name=creator_name,
        winner_name=winner_name,
        created_at=lobby.created_at,
        started_at=lobby.started_at,
        finished_at=lobby.finished_at,
        sync_error=lobby.sync_error,
    )


@router.get("/stats", response_model=AdminStatsResponse)
def admin_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total_users = db.query(func.count(User.id)).scalar()
    banned_users = db.query(func.count(User.id)).filter(User.is_banned.is_(True)).scalar()
    admin_users = db.query(func.count(User.id)).filter(User.is_admin.is_(True)).scalar()

    active_lobbies = db.query(func.count(Lobby.id)).filter(Lobby.status == "active").scalar()
    waiting_lobbies = db.query(func.count(Lobby.id)).filter(Lobby.status == "waiting").scalar()
    finished_lobbies = db.query(func.count(Lobby.id)).filter(Lobby.status == "finished").scalar()

    today_start = _utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    games_today = (
        db.query(func.count(Lobby.id))
        .filter(Lobby.started_at >= today_start)
        .scalar()
    )

    problem_count = db.query(func.count(LeetCodeProblem.id)).scalar()
    catalog_last_synced = (
        db.query(func.max(LeetCodeProblem.updated_at)).scalar()
    )
    failed_syncs = (
        db.query(func.count(Lobby.id))
        .filter(Lobby.sync_error.isnot(None))
        .scalar()
    )

    today = _utcnow().date()
    week_start = today - timedelta(days=6)
    dau_series = [
        {"date": (week_start + timedelta(days=offset)).isoformat(), "active": 0}
        for offset in range(7)
    ]
    dau_rows = (
        db.query(UserActivity.date, func.count(func.distinct(UserActivity.user_id)))
        .filter(UserActivity.date >= week_start)
        .group_by(UserActivity.date)
        .all()
    )
    active_by_day = {day.isoformat(): count for day, count in dau_rows}
    for entry in dau_series:
        entry["active"] = active_by_day.get(entry["date"], 0)

    dau_today = next(e["active"] for e in dau_series if e["date"] == today.isoformat())
    dau_7d = (
        db.query(func.count(func.distinct(UserActivity.user_id)))
        .filter(UserActivity.date >= week_start)
        .scalar()
        or 0
    )
    solvers_today = (
        db.query(func.count(func.distinct(DailyActivity.user_id)))
        .filter(DailyActivity.date == today, DailyActivity.submissions_count > 0)
        .scalar()
        or 0
    )

    return AdminStatsResponse(
        total_users=total_users,
        banned_users=banned_users,
        admin_users=admin_users,
        active_lobbies=active_lobbies,
        waiting_lobbies=waiting_lobbies,
        finished_lobbies=finished_lobbies,
        games_today=games_today,
        problem_count=problem_count,
        catalog_last_synced_at=catalog_last_synced,
        failed_syncs=failed_syncs,
        dau_today=dau_today,
        dau_7d=dau_7d,
        solvers_today=solvers_today,
        dau_series=dau_series,
    )


@router.get("/lobbies", response_model=AdminLobbyListResponse)
def list_lobbies(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None, max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    query = db.query(Lobby)
    if status_filter:
        if status_filter not in {"waiting", "active", "finished"}:
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query = query.filter(Lobby.status == status_filter)
    if q:
        query = query.filter(Lobby.name.ilike(f"%{q.strip()}%"))

    total = query.count()
    lobbies = query.order_by(Lobby.id.desc()).offset(offset).limit(limit).all()
    return AdminLobbyListResponse(
        total=total,
        offset=offset,
        limit=limit,
        lobbies=[_lobby_to_out(l, db) for l in lobbies],
    )


@router.post("/lobbies/{lobby_id}/force-end", response_model=AdminLobbyOut)
def force_end_lobby(
    lobby_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    lobby = db.get(Lobby, lobby_id)
    if lobby is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    if lobby.status == "finished":
        raise HTTPException(status_code=409, detail="Lobby is already finished")

    lobby.status = "finished"
    lobby.finished_at = _utcnow()
    db.commit()
    db.refresh(lobby)
    return _lobby_to_out(lobby, db)


@router.delete("/lobbies/{lobby_id}", status_code=204)
def admin_delete_lobby(
    lobby_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    lobby = db.get(Lobby, lobby_id)
    if lobby is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    _delete_lobby_with_children(lobby, db)
    db.commit()
