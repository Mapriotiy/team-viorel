"""Admin-only debug tools for live lobbies.

Every endpoint in this module is gated behind require_admin, so only admin
users can trigger them — a non-admin hitting the URL directly gets a 403.

Debug tools are intentionally plain: they mutate game state on purpose.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby import Lobby
from app.models.lobby_event import LobbyEvent
from app.models.lobby_map import LobbyMap
from app.models.lobby_map_province import LobbyMapProvince
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.schemas.debug import (
    DebugCaptureRequest,
    DebugFinishRequest,
    DebugFinishResponse,
    DebugPowerupsGrant,
    DebugPowerupsResponse,
    DebugProvinceResponse,
)
from app.services.powerups import POWERUP_TYPES, powerup_counts
from app.services.scoring import flag_points
from app.services.game_modes.base import WinnerResult, finish_lobby
from app.services.game_modes.territory import _evaluate_winner
from app.services.lobby_settings import ordered_players, team_by_user

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _display_name(user: User) -> str:
    return user.leetcode_username or user.display_name or f"user #{user.id}"


def _get_lobby(lobby_id: int, db: Session) -> Lobby:
    lobby = db.get(Lobby, lobby_id)
    if lobby is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return lobby


def _get_province(lobby_id: int, province_id: str, db: Session) -> LobbyMapProvince:
    map_row = db.query(LobbyMap).filter_by(lobby_id=lobby_id).first()
    if map_row is None:
        raise HTTPException(status_code=404, detail="Lobby has no map")
    province = (
        db.query(LobbyMapProvince)
        .filter_by(lobby_map_id=map_row.id, province_id=province_id)
        .first()
    )
    if province is None:
        raise HTTPException(status_code=404, detail="Province not found")
    return province


def _to_province(province: LobbyMapProvince) -> DebugProvinceResponse:
    return DebugProvinceResponse(
        province_id=province.province_id,
        captured_by=province.captured_by,
        captured_at=province.captured_at,
        captured_runtime_ms=province.captured_runtime_ms,
        capturer_leetcode_username=province.capturer_leetcode_username,
        fortified_until=province.fortified_until,
    )


def _record_debug_event(
    db: Session,
    lobby_id: int,
    province: LobbyMapProvince,
    event_type: str,
    user: User,
    runtime_ms: int | None = None,
) -> None:
    slug = province.problem_title_slug
    problem = db.query(LeetCodeProblem).filter_by(title_slug=slug).first()
    lobby_player = (
        db.query(LobbyPlayer)
        .filter_by(lobby_id=lobby_id, user_id=user.id)
        .first()
    )
    db.add(
        LobbyEvent(
            lobby_id=lobby_id,
            province_id=province.province_id,
            province_name=province.province_name,
            region_name=province.region_name,
            event_type=event_type,
            actor_user_id=user.id,
            actor_username=_display_name(user),
            actor_faction_id=lobby_player.faction_id if lobby_player else None,
            problem_title_slug=slug,
            problem_title=problem.title if problem else None,
            problem_difficulty=problem.difficulty if problem else None,
            points=flag_points(problem.difficulty) if problem else None,
            runtime_ms=runtime_ms,
        )
    )


def _maybe_finish_lobby(lobby: Lobby, db: Session) -> None:
    """End the game when a debug capture pushes a player/team over the win bar."""
    if lobby.status == "finished":
        return
    if lobby.game_mode not in ("free_for_all", "team_battle"):
        return
    lmap = db.query(LobbyMap).filter_by(lobby_id=lobby.id).first()
    if lmap is None:
        return
    provinces = (
        db.query(LobbyMapProvince)
        .filter_by(lobby_map_id=lmap.id)
        .all()
    )
    if not provinces:
        return
    players = ordered_players(lobby.id, db)
    teams = team_by_user(lobby, players)
    slugs = {p.problem_title_slug for p in provinces}
    problems = db.query(LeetCodeProblem).filter(LeetCodeProblem.title_slug.in_(slugs)).all() if slugs else []
    winner = _evaluate_winner(
        lobby,
        provinces,
        teams,
        difficulty_by_slug={p.title_slug: p.difficulty for p in problems if p.difficulty},
    )
    if winner is not None:
        finish_lobby(lobby, winner, players, db)
        db.commit()


@router.post("/lobbies/{lobby_id}/powerups", response_model=DebugPowerupsResponse)
def grant_powerups(
    lobby_id: int,
    payload: DebugPowerupsGrant,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    _get_lobby(lobby_id, db)
    player = (
        db.query(LobbyPlayer)
        .filter_by(lobby_id=lobby_id, user_id=payload.user_id)
        .first()
    )
    if player is None:
        raise HTTPException(status_code=404, detail="Player is not in this lobby")

    counts = powerup_counts(player)
    for name in POWERUP_TYPES:
        amount = getattr(payload, name, 0)
        if amount:
            counts[name] = max(0, counts[name] + amount)
    player.powerups = counts
    db.commit()
    return DebugPowerupsResponse(user_id=payload.user_id, powerups=counts)


@router.post(
    "/lobbies/{lobby_id}/provinces/{province_id}/capture",
    response_model=DebugProvinceResponse,
)
def debug_capture(
    lobby_id: int,
    province_id: str,
    payload: DebugCaptureRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    province = _get_province(lobby_id, province_id, db)
    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    now = _utcnow()
    if province.first_captured_by is None:
        province.first_captured_by = user.id
        province.first_captured_at = now
    province.captured_by = user.id
    province.captured_at = now
    province.captured_runtime_ms = payload.runtime_ms
    province.captured_submission_url = None
    province.capturer_leetcode_username = _display_name(user)
    province.fortified_until = None

    _record_debug_event(db, lobby_id, province, "debug_capture", user, payload.runtime_ms)
    db.commit()
    db.refresh(province)

    lobby = db.get(Lobby, lobby_id)
    if lobby is not None:
        _maybe_finish_lobby(lobby, db)

    return _to_province(province)


@router.post(
    "/lobbies/{lobby_id}/provinces/{province_id}/uncapture",
    response_model=DebugProvinceResponse,
)
def debug_uncapture(
    lobby_id: int,
    province_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    province = _get_province(lobby_id, province_id, db)

    province.captured_by = None
    province.captured_at = None
    province.captured_runtime_ms = None
    province.captured_submission_url = None
    province.capturer_leetcode_username = None
    province.first_captured_by = None
    province.first_captured_at = None
    province.fortified_until = None

    _record_debug_event(db, lobby_id, province, "debug_uncapture", admin)
    db.commit()
    db.refresh(province)
    return _to_province(province)


@router.post("/lobbies/{lobby_id}/finish", response_model=DebugFinishResponse)
def debug_finish(
    lobby_id: int,
    payload: DebugFinishRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Force a game result. winner_user_id/faction_id select the winner; both
    None ends the lobby as a draw. Uses the real finish path so the winner
    banner, summary, and game_won event fire exactly like a natural end."""
    lobby = _get_lobby(lobby_id, db)
    if lobby.status == "finished":
        raise HTTPException(status_code=409, detail="Lobby is already finished")

    players = ordered_players(lobby.id, db)
    winner = WinnerResult(
        winner_user_id=payload.winner_user_id,
        winner_faction_id=payload.winner_faction_id,
        reason="admin_forced",
    )
    finish_lobby(lobby, winner, players, db)
    db.commit()
    db.refresh(lobby)
    return DebugFinishResponse(
        status=lobby.status,
        winner_user_id=lobby.winner_id,
        winner_faction_id=lobby.winner_faction_id,
    )
