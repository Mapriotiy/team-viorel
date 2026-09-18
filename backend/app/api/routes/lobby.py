"""Lobby lifecycle routes. Game logic lives in app.services.game_modes;
these routes dispatch on lobby.game_mode via the mode registry."""

import asyncio
import hashlib
import json
import logging
import secrets
from typing import Any

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from starlette.responses import Response, StreamingResponse
from jwt.exceptions import InvalidTokenError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import ALGORITHM
from app.db.session import SessionLocal, get_db
from app.models.lobby import Lobby
from app.models.lobby_board_cell import LobbyBoardCell
from app.models.lobby_event import LobbyEvent
from app.models.lobby_player import LobbyPlayer
from app.models.lobby_invite import LobbyInvite
from app.models.lobby_map import LobbyMap
from app.models.lobby_map_province import LobbyMapProvince
from app.models.user import User
from app.schemas.lobby import (
    CreateLobbyRequest,
    CreateLobbyResponse,
    InviteLobbyResponse,
    LobbyEventResponse,
    LobbyMapSelectionRequest,
    LobbyMapSelectionResponse,
    LobbyPlayerResponse,
    LobbyResponse,
    FactionResponse,
    UpdateFactionRequest,
    UpdatePlayerFactionRequest,
)
from app.services.events import get_lobby_events
from app.services.game_modes import get_mode
from app.services.map_config import build_default_map_draft
from app.services.lobby_settings import (
    ALLOWED_FACTION_COLORS,
    ALLOWED_PROGRAMMING_LANGUAGES,
    FACTION_NAMES,
    default_factions,
    lobby_factions,
    lobby_programming_language,
    ordered_players,
    set_lobby_factions,
    utcnow,
)
from app.services.leetcode_sync import finish_lobby_sync, maybe_enter_lobby_sync
from app.services.map_thumbnail import render_lobby_map_thumbnail
from app.services.og_card import OgCardData, render_og_card
from app.services.lobby_settings import team_by_user
from app.services.powerups import (
    consume_powerup,
    fortify_province,
    has_powerup,
    is_fortified,
    reroll_province,
    siege_province,
)
from app.services.problem_catalog import catalog_problem_count, catalog_has_minimum

logger = logging.getLogger(__name__)
router = APIRouter()


def _invite_url(token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/?lobby={token}"


def _default_map_selection() -> dict[str, Any]:
    return {"kind": "generated", "draft": build_default_map_draft()}


def _normalize_map_selection(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return _default_map_selection()
    if value.get("kind") != "generated":
        return _default_map_selection()
    draft = value.get("draft")
    if not isinstance(draft, dict):
        return _default_map_selection()
    return {"kind": "generated", "draft": draft}


def _active_or_pending_map_selection(lobby: Lobby, db: Session) -> dict[str, Any]:
    if lobby.status in {"active", "finished"}:
        lmap = db.query(LobbyMap).filter_by(lobby_id=lobby.id).first()
        if lmap:
            return _normalize_map_selection(lmap.map_config)
    return _normalize_map_selection(lobby.map_config)


def _require_lobby_member(lobby: Lobby, user_id: int, db: Session) -> None:
    is_member = db.query(LobbyPlayer).filter_by(lobby_id=lobby.id, user_id=user_id).first()
    if not is_member:
        raise HTTPException(403, "Not a lobby member")


def _validate_asset_path(value: Any, field: str) -> None:
    if not isinstance(value, str) or not value or "\\" in value or value.startswith("/") or ".." in value.split("/"):
        raise HTTPException(400, f"Invalid generated map {field}")
    if not value.startswith(("maps/", "map-test/")):
        raise HTTPException(400, f"Unsupported generated map {field}")
    if not value.lower().endswith((".svg", ".webp", ".png", ".jpg", ".jpeg")):
        raise HTTPException(400, f"Unsupported generated map {field} type")


def _validate_generated_draft(draft: Any) -> dict[str, Any]:
    if not isinstance(draft, dict):
        raise HTTPException(400, "Generated map draft is required")
    if draft.get("schemaVersion") != 1:
        raise HTTPException(400, "Unsupported generated map schema")
    if draft.get("size") not in {"small", "medium", "large"}:
        raise HTTPException(400, "Invalid generated map size")

    islands = draft.get("islands")
    provinces = draft.get("provinces")
    regions = draft.get("regions")
    if not isinstance(islands, list) or not islands:
        raise HTTPException(400, "Generated map must contain islands")
    if not isinstance(provinces, list) or not provinces:
        raise HTTPException(400, "Generated map must contain provinces")
    if not isinstance(regions, list) or not regions:
        raise HTTPException(400, "Generated map must contain regions")

    if draft.get("seaBaseSrc") is not None:
        _validate_asset_path(draft.get("seaBaseSrc"), "seaBaseSrc")
    for island in islands:
        if not isinstance(island, dict):
            raise HTTPException(400, "Generated map island is invalid")
        if island.get("svgPath") is not None:
            _validate_asset_path(island.get("svgPath"), "svgPath")
        if island.get("backPath") is not None:
            _validate_asset_path(island.get("backPath"), "backPath")
    for sprite in draft.get("seaSprites") or []:
        if not isinstance(sprite, dict):
            raise HTTPException(400, "Generated map sprite is invalid")
        if sprite.get("src") is not None:
            _validate_asset_path(sprite.get("src"), "sprite path")

    region_ids = {
        str(region.get("regionId"))
        for region in regions
        if isinstance(region, dict) and region.get("regionId")
    }
    if not region_ids:
        raise HTTPException(400, "Generated map regions are invalid")

    province_ids: set[str] = set()
    for province in provinces:
        if not isinstance(province, dict):
            raise HTTPException(400, "Generated map provinces are invalid")
        province_id = province.get("provinceId")
        region_id = province.get("regionId")
        if not province_id or not region_id:
            raise HTTPException(400, "Generated map province is missing ids")
        if str(province_id) in province_ids:
            raise HTTPException(400, "Generated map province ids must be unique")
        if str(region_id) not in region_ids:
            raise HTTPException(400, "Generated map province references an unknown region")
        province_ids.add(str(province_id))

    return draft


def _selection_from_payload(payload: LobbyMapSelectionRequest) -> dict[str, Any]:
    if payload.kind == "default":
        return _default_map_selection()
    draft = _validate_generated_draft(payload.draft)
    return {"kind": "generated", "draft": draft}


def _to_lobby_response(lobby: Lobby, db: Session, invite_url: str | None = None) -> LobbyResponse:
    players = [
        LobbyPlayerResponse(
            user_id=u.id,
            leetcode_username=u.leetcode_username,
            faction_id=lp.faction_id,
            status=lp.status,
        )
        for lp, u in ordered_players(lobby.id, db)
    ]
    left_ids = list(lobby.left_player_ids or [])
    left_players: list[LobbyPlayerResponse] = []
    if left_ids:
        left_users = {u.id: u for u in db.query(User).filter(User.id.in_(left_ids)).all()}
        left_players = [
            LobbyPlayerResponse(
                user_id=uid,
                leetcode_username=left_users[uid].leetcode_username,
                faction_id=None,
                status="left",
            )
            for uid in left_ids
            if uid in left_users
        ]
    return LobbyResponse(
        id=lobby.id,
        creator_id=lobby.creator_id,
        name=lobby.name,
        status=lobby.status,
        game_mode=lobby.game_mode,
        map_size=lobby.map_size,
        max_players=lobby.max_players,
        faction_mode=lobby.faction_mode,
        faction_count=lobby.faction_count,
        factions=[FactionResponse(**faction) for faction in lobby_factions(lobby)],
        map_selection=_active_or_pending_map_selection(lobby, db),
        programming_language=lobby_programming_language(lobby),
        win_condition=lobby.win_condition,
        players=players,
        left_players=left_players,
        created_at=lobby.created_at,
        started_at=lobby.started_at,
        finished_at=lobby.finished_at,
        winner_id=lobby.winner_id,
        winner_faction_id=lobby.winner_faction_id,
        invite_url=invite_url,
    )


def _add_player(lobby: Lobby, user_id: int, db: Session, faction_id: int | None = None) -> None:
    if db.query(LobbyPlayer).filter_by(lobby_id=lobby.id, user_id=user_id).first():
        return
    if lobby.left_player_ids:
        lobby.left_player_ids = [uid for uid in lobby.left_player_ids if uid != user_id]
    count = db.query(LobbyPlayer).filter_by(lobby_id=lobby.id).count()
    if not lobby.faction_mode and count >= lobby.max_players:
        raise HTTPException(409, "Lobby is full")

    if lobby.faction_mode and lobby.faction_count > 0:
        if faction_id is not None and 1 <= faction_id <= lobby.faction_count:
            fid = faction_id
        else:
            counts: dict[int, int] = {}
            for (fid,) in db.query(LobbyPlayer.faction_id).filter_by(lobby_id=lobby.id).all():
                if fid:
                    counts[fid] = counts.get(fid, 0) + 1
            fid = min(range(1, lobby.faction_count + 1), key=lambda f: counts.get(f, 0))
    else:
        fid = count + 1

    db.add(LobbyPlayer(lobby_id=lobby.id, user_id=user_id, faction_id=fid, status="accepted"))


# ── Create ──

@router.post("", response_model=CreateLobbyResponse)
def create_lobby(
    payload: CreateLobbyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_mode(payload.game_mode)  # 400 on unknown modes

    faction_count = min(max(payload.faction_count, 2), 4) if payload.faction_mode else 0
    win_condition = dict(payload.win_condition or {})
    if not win_condition.get("type"):
        win_condition.setdefault("type", "points")
        win_condition.setdefault("threshold", 5000)
    programming_language = payload.programming_language if payload.programming_language in ALLOWED_PROGRAMMING_LANGUAGES else "python3"
    win_condition["programming_language"] = programming_language
    if payload.faction_mode:
        win_condition["factions"] = default_factions(faction_count)
    lobby = Lobby(
        creator_id=current_user.id,
        name=payload.name,
        game_mode=payload.game_mode,
        map_size=payload.map_size,
        max_players=0 if payload.faction_mode else payload.max_players,
        faction_mode=payload.faction_mode,
        faction_count=faction_count,
        win_condition=win_condition,
    )
    db.add(lobby)
    db.flush()

    db.add(LobbyPlayer(lobby_id=lobby.id, user_id=current_user.id, faction_id=1, status="ready"))

    token = secrets.token_urlsafe(24)
    db.add(LobbyInvite(lobby_id=lobby.id, token=token, created_by_user_id=current_user.id))
    db.commit()
    db.refresh(lobby)

    url = _invite_url(token)
    return CreateLobbyResponse(lobby=_to_lobby_response(lobby, db, url), invite_url=url)


# ── Get ──

@router.get("/{lobby_id}", response_model=LobbyResponse)
def get_lobby(lobby_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    _require_lobby_member(lobby, current_user.id, db)
    invite = db.query(LobbyInvite).filter_by(lobby_id=lobby.id).first()
    url = _invite_url(invite.token) if invite else None
    return _to_lobby_response(lobby, db, url)


@router.get("/{lobby_id}/map-selection", response_model=LobbyMapSelectionResponse)
def get_map_selection(
    lobby_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    _require_lobby_member(lobby, current_user.id, db)
    return LobbyMapSelectionResponse(selection=_active_or_pending_map_selection(lobby, db))


@router.put("/{lobby_id}/map-selection", response_model=LobbyMapSelectionResponse)
def update_map_selection(
    lobby_id: int,
    payload: LobbyMapSelectionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    if lobby.creator_id != current_user.id:
        raise HTTPException(403, "Only creator can choose the map")
    if lobby.status != "waiting":
        raise HTTPException(409, "Game already started")

    selection = _selection_from_payload(payload)
    lobby.map_config = selection
    if selection["kind"] == "generated":
        lobby.map_size = str(selection["draft"].get("size") or lobby.map_size)
    db.commit()
    db.refresh(lobby)
    return LobbyMapSelectionResponse(selection=_active_or_pending_map_selection(lobby, db))


# ── Invite via token ──

@router.get("/invites/{token}", response_model=InviteLobbyResponse)
def get_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(LobbyInvite).filter_by(token=token).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    lobby = db.get(Lobby, invite.lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    creator = db.get(User, lobby.creator_id)
    count = db.query(LobbyPlayer).filter_by(lobby_id=lobby.id).count()
    return InviteLobbyResponse(
        lobby_id=lobby.id, lobby_name=lobby.name,
        creator_username=creator.leetcode_username if creator else "?",
        player_count=count, max_players=lobby.max_players, status=lobby.status,
        faction_mode=lobby.faction_mode, faction_count=lobby.faction_count,
        programming_language=lobby_programming_language(lobby),
    )


@router.post("/invites/{token}/accept", response_model=LobbyResponse)
def accept_invite(token: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    invite = db.query(LobbyInvite).filter_by(token=token).first()
    if not invite:
        raise HTTPException(404, "Invite not found")
    lobby = db.get(Lobby, invite.lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    if lobby.status != "waiting":
        raise HTTPException(409, "Game already started")
    _add_player(lobby, current_user.id, db)
    db.commit()
    return _to_lobby_response(lobby, db, _invite_url(token))


# ── Invite user by ID ──

@router.post("/{lobby_id}/invite-user", response_model=LobbyResponse)
def invite_user(
    lobby_id: int,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    is_member = db.query(LobbyPlayer).filter_by(lobby_id=lobby.id, user_id=current_user.id).first()
    if not is_member:
        raise HTTPException(403, "Not a lobby member")
    uid = payload.get("user_id")
    if not uid:
        raise HTTPException(400, "user_id required")
    _add_player(lobby, int(uid), db, faction_id=payload.get("faction_id"))
    db.commit()
    invite = db.query(LobbyInvite).filter_by(lobby_id=lobby.id).first()
    return _to_lobby_response(lobby, db, _invite_url(invite.token) if invite else None)


# ── Factions ──

@router.patch("/{lobby_id}/factions/{faction_id}", response_model=LobbyResponse)
def update_faction(
    lobby_id: int,
    faction_id: int,
    payload: UpdateFactionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    if lobby.creator_id != current_user.id:
        raise HTTPException(403, "Only creator can edit factions")
    if lobby.status != "waiting":
        raise HTTPException(409, "Game already started")
    if not lobby.faction_mode:
        raise HTTPException(400, "Lobby is not in faction mode")
    if faction_id < 1 or faction_id > lobby.faction_count:
        raise HTTPException(400, "Invalid faction")

    color = payload.color.strip()
    if len(color) != 7 or not color.startswith("#"):
        raise HTTPException(400, "Color must be a hex value")
    if color not in ALLOWED_FACTION_COLORS:
        raise HTTPException(400, "Color is not in the faction palette")

    factions = lobby_factions(lobby)
    for faction in factions:
        if faction["id"] == faction_id:
            faction["name"] = payload.name.strip()[:32] or FACTION_NAMES.get(faction_id, f"Faction {faction_id}")
            faction["color"] = color
            break

    set_lobby_factions(lobby, factions)
    db.commit()
    db.refresh(lobby)
    invite = db.query(LobbyInvite).filter_by(lobby_id=lobby.id).first()
    return _to_lobby_response(lobby, db, _invite_url(invite.token) if invite else None)


@router.patch("/{lobby_id}/players/{user_id}/faction", response_model=LobbyResponse)
def update_player_faction(
    lobby_id: int,
    user_id: int,
    payload: UpdatePlayerFactionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    if lobby.creator_id != current_user.id:
        raise HTTPException(403, "Only creator can assign factions")
    if lobby.status != "waiting":
        raise HTTPException(409, "Game already started")
    if not lobby.faction_mode:
        raise HTTPException(400, "Lobby is not in faction mode")
    if payload.faction_id < 1 or payload.faction_id > lobby.faction_count:
        raise HTTPException(400, "Invalid faction")

    player = db.query(LobbyPlayer).filter_by(lobby_id=lobby_id, user_id=user_id).first()
    if not player:
        raise HTTPException(404, "Player not found in lobby")

    player.faction_id = payload.faction_id
    db.commit()
    db.refresh(lobby)
    invite = db.query(LobbyInvite).filter_by(lobby_id=lobby.id).first()
    return _to_lobby_response(lobby, db, _invite_url(invite.token) if invite else None)


@router.delete("/{lobby_id}/leave", status_code=204)
def leave_lobby(lobby_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    lp = db.query(LobbyPlayer).filter_by(lobby_id=lobby_id, user_id=current_user.id).first()
    if not lp:
        raise HTTPException(404, "Not in lobby")
    db.delete(lp)
    db.flush()

    if current_user.id not in (lobby.left_player_ids or []):
        lobby.left_player_ids = (lobby.left_player_ids or []) + [current_user.id]

    remaining_players = (
        db.query(LobbyPlayer)
        .filter_by(lobby_id=lobby_id)
        .order_by(LobbyPlayer.joined_at.asc())
        .all()
    )
    if not remaining_players:
        _delete_lobby_with_children(lobby, db)
    elif lobby.creator_id == current_user.id:
        lobby.creator_id = remaining_players[0].user_id

    db.commit()


@router.delete("/{lobby_id}", status_code=204)
def delete_lobby(lobby_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a lobby entirely. Only the creator may do this."""
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    if lobby.creator_id != current_user.id:
        raise HTTPException(403, "Only the creator can delete the lobby")
    _delete_lobby_with_children(lobby, db)
    db.commit()


def _delete_lobby_with_children(lobby: Lobby, db: Session) -> None:
    """Delete a lobby and every row that references it.

    Child rows are removed explicitly so it works on SQLite too (SQLite does
    not enforce FK ON DELETE CASCADE), not just Postgres.
    """
    lobby_id = lobby.id
    map_ids = [row.id for row in db.query(LobbyMap.id).filter_by(lobby_id=lobby_id).all()]
    if map_ids:
        db.query(LobbyMapProvince).filter(
            LobbyMapProvince.lobby_map_id.in_(map_ids)
        ).delete(synchronize_session=False)
        db.query(LobbyMap).filter(LobbyMap.id.in_(map_ids)).delete(synchronize_session=False)
    db.query(LobbyBoardCell).filter_by(lobby_id=lobby_id).delete(synchronize_session=False)
    db.query(LobbyEvent).filter_by(lobby_id=lobby_id).delete(synchronize_session=False)
    db.query(LobbyPlayer).filter_by(lobby_id=lobby_id).delete(synchronize_session=False)
    db.query(LobbyInvite).filter_by(lobby_id=lobby_id).delete(synchronize_session=False)
    db.delete(lobby)


# ── Game (dispatched to the mode registry) ──

@router.post("/{lobby_id}/start", response_model=LobbyResponse)
async def start_game(lobby_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    if lobby.creator_id != current_user.id:
        raise HTTPException(403, "Only creator can start")
    if lobby.status != "waiting":
        raise HTTPException(409, "Already started")
    players = ordered_players(lobby.id, db)
    if len(players) < 1:
        raise HTTPException(400, "Need at least 1 player")

    if not catalog_has_minimum(db):
        raise HTTPException(
            503,
            f"Problem catalog has {catalog_problem_count(db)} problems; preload it before starting a game",
        )
    await get_mode(lobby.game_mode).start(lobby, players, db)

    lobby.status = "active"
    lobby.started_at = utcnow()
    db.commit()
    db.refresh(lobby)
    invite = db.query(LobbyInvite).filter_by(lobby_id=lobby.id).first()
    return _to_lobby_response(lobby, db, _invite_url(invite.token) if invite else None)


@router.get("/{lobby_id}/map")
def get_game_state(lobby_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    return get_mode(lobby.game_mode).get_state(lobby, ordered_players(lobby.id, db), db)


@router.post("/{lobby_id}/map/sync")
async def sync_game(lobby_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    mode = get_mode(lobby.game_mode)
    players = ordered_players(lobby.id, db)
    if lobby.status == "finished":
        payload = mode.get_state(lobby, players, db)
        payload["sync"] = {"status": "finished"}
        return payload

    can_sync, sync_meta = await maybe_enter_lobby_sync(lobby.id, db)
    if not can_sync:
        payload = mode.get_state(lobby, players, db)
        payload["sync"] = sync_meta
        return payload

    try:
        payload = await mode.sync(lobby, players, db)
    except Exception as exc:
        finish_lobby_sync(lobby.id, db, status="failed", error=str(exc))
        raise

    payload["sync"] = finish_lobby_sync(lobby.id, db)
    return payload


# ── Power-ups ──


def _require_powerup_lobby(lobby_id: int, db: Session) -> Lobby:
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    if lobby.status != "active":
        raise HTTPException(409, "Game is not active")
    if lobby.game_mode not in ("free_for_all", "team_battle"):
        raise HTTPException(400, "Power-ups are only available in territory games")
    return lobby


def _get_lobby_province(lobby_id: int, province_id: str, db: Session) -> LobbyMapProvince:
    province = (
        db.query(LobbyMapProvince)
        .join(LobbyMap, LobbyMapProvince.lobby_map_id == LobbyMap.id)
        .filter(LobbyMap.lobby_id == lobby_id, LobbyMapProvince.province_id == province_id)
        .first()
    )
    if not province:
        raise HTTPException(404, "Province not found")
    return province


def _require_powerup(lobby: Lobby, player: LobbyPlayer, powerup_type: str) -> None:
    if not has_powerup(player, powerup_type):
        raise HTTPException(409, f"No {powerup_type} power-up available")


def _game_payload(lobby: Lobby, db: Session) -> dict:
    players = ordered_players(lobby.id, db)
    return get_mode(lobby.game_mode).get_state(lobby, players, db)


@router.post("/{lobby_id}/provinces/{province_id}/reroll")
def reroll_province_endpoint(
    lobby_id: int,
    province_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = _require_powerup_lobby(lobby_id, db)
    players = ordered_players(lobby.id, db)
    _require_lobby_member(lobby, current_user.id, db)
    player = next((lp for lp, _ in players if lp.user_id == current_user.id), None)
    if player is None:
        raise HTTPException(403, "You are not in this lobby")
    _require_powerup(lobby, player, "reroll")

    province = _get_lobby_province(lobby_id, province_id, db)
    if province.captured_by is not None:
        raise HTTPException(409, "Reroll can only target a free province")

    if reroll_province(province, current_user.id, db) is None:
        raise HTTPException(400, "No suitable problem to reroll into")

    consume_powerup(player, "reroll")
    db.commit()
    return _game_payload(lobby, db)


@router.post("/{lobby_id}/provinces/{province_id}/fortify")
def fortify_province_endpoint(
    lobby_id: int,
    province_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = _require_powerup_lobby(lobby_id, db)
    players = ordered_players(lobby.id, db)
    _require_lobby_member(lobby, current_user.id, db)
    player = next((lp for lp, _ in players if lp.user_id == current_user.id), None)
    if player is None:
        raise HTTPException(403, "You are not in this lobby")
    _require_powerup(lobby, player, "fortify")

    province = _get_lobby_province(lobby_id, province_id, db)
    if province.captured_by is None:
        raise HTTPException(409, "Cannot fortify a free province")
    teams = team_by_user(lobby, players)
    if teams.get(province.captured_by) != teams.get(current_user.id):
        raise HTTPException(403, "You can only fortify your own province")
    if is_fortified(province):
        raise HTTPException(409, "Province is already fortified")

    fortify_province(province)
    consume_powerup(player, "fortify")
    db.commit()
    return _game_payload(lobby, db)


@router.post("/{lobby_id}/provinces/{province_id}/siege")
def siege_province_endpoint(
    lobby_id: int,
    province_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = _require_powerup_lobby(lobby_id, db)
    players = ordered_players(lobby.id, db)
    _require_lobby_member(lobby, current_user.id, db)
    player = next((lp for lp, _ in players if lp.user_id == current_user.id), None)
    if player is None:
        raise HTTPException(403, "You are not in this lobby")
    _require_powerup(lobby, player, "siege")

    province = _get_lobby_province(lobby_id, province_id, db)
    if province.captured_by is not None:
        raise HTTPException(409, "Siege can only target a free province")

    if siege_province(province, current_user.id, db) is None:
        raise HTTPException(400, "No suitable easier problem available")

    consume_powerup(player, "siege")
    db.commit()
    return _game_payload(lobby, db)


@router.get("/{lobby_id}/events", response_model=list[LobbyEventResponse])
def get_events(
    lobby_id: int,
    after_id: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    _require_lobby_member(lobby, current_user.id, db)
    limit = max(1, min(limit, 200))
    return get_lobby_events(lobby_id, after_id, limit, db)


def _replay_payload(lobby: Lobby, db: Session) -> dict:
    if lobby.status != "finished":
        raise HTTPException(403, "Replay becomes available once the game ends")

    players = ordered_players(lobby.id, db)
    state = get_mode(lobby.game_mode).get_state(lobby, players, db)
    events = [
        LobbyEventResponse.model_validate(event).model_dump(mode="json")
        for event in get_lobby_events(lobby.id, 0, limit=10000, db=db)
    ]
    players_out = [
        {
            "user_id": u.id,
            "leetcode_username": u.leetcode_username,
            "faction_id": lp.faction_id,
        }
        for lp, u in players
    ]
    return {
        **state,
        "replay": True,
        "events": events,
        "players": players_out,
        "factions": lobby_factions(lobby) if lobby.faction_mode else [],
    }


@router.get("/{lobby_id}/replay-token")
def lobby_replay_token(
    lobby_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    _require_lobby_member(lobby, current_user.id, db)
    if lobby.status != "finished":
        raise HTTPException(403, "Replay becomes available once the game ends")
    if not lobby.replay_token:
        lobby.replay_token = secrets.token_urlsafe(32)
        db.commit()
    return {"token": lobby.replay_token}


@router.get("/replay/{token}")
def lobby_replay_by_token(token: str, db: Session = Depends(get_db)):
    lobby = db.query(Lobby).filter_by(replay_token=token).first()
    if not lobby:
        raise HTTPException(404, "Replay not found")
    return _replay_payload(lobby, db)


@router.get("/{lobby_id}/replay")
def lobby_replay_legacy(
    lobby_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy member-only replay endpoint; public links use opaque tokens."""
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    _require_lobby_member(lobby, current_user.id, db)
    return _replay_payload(lobby, db)


def _render_lobby_og(lobby: Lobby, db: Session) -> bytes:
    if lobby.status != "finished":
        raise HTTPException(403, "Image is available once the game ends")

    players = ordered_players(lobby.id, db)
    state = get_mode(lobby.game_mode).get_state(lobby, players, db)
    score = state.get("score") or []
    top = None
    for entry in score:
        if top is None or entry.total_points > top.total_points:
            top = entry
    winner = state.get("winner") or {}
    label = winner.get("label")

    return render_og_card(
        OgCardData(
            title="VICTORY" if label else "MATCH COMPLETE",
            name=label or (top.label if top else "MapCode"),
            accent=top.color if top else "#ffa116",
            points=top.total_points if top else 0,
            provinces=top.provinces if top else 0,
        )
    )


@router.get("/share/{token}/og.png")
def shared_lobby_og_image(token: str, db: Session = Depends(get_db)):
    lobby = db.query(Lobby).filter_by(replay_token=token).first()
    if not lobby:
        raise HTTPException(404, "Share not found")
    return Response(content=_render_lobby_og(lobby, db), media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@router.get("/{lobby_id}/og.png")
def lobby_og_image(
    lobby_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy member-only OG endpoint; public shares use opaque tokens."""
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    _require_lobby_member(lobby, current_user.id, db)
    return Response(content=_render_lobby_og(lobby, db), media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@router.get("/{lobby_id}/thumbnail.png")
def lobby_map_thumbnail(
    lobby_id: int,
    request: Request,
    w: int = Query(320, ge=64, le=1600),
    q: int = Query(82, ge=30, le=100),
    fmt: str = Query("png", pattern="^(png|webp)$"),
    db: Session = Depends(get_db),
):
    """Current map state as an image (sea + islands + regions + captures).

    Rendered server-side from the DB and local assets — no LeetCode calls, no
    lobby sync. Used for lightweight dashboard thumbnails.
    """
    png = render_lobby_map_thumbnail(lobby_id, width=w, quality=q, fmt=fmt, db=db)
    if png is None:
        raise HTTPException(404, "Lobby map not found")
    media = "image/webp" if fmt == "webp" else "image/png"
    etag = f'"{hashlib.sha1(png).hexdigest()}"'
    if request is not None and request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": "public, max-age=300, stale-while-revalidate=86400"})
    return Response(
        content=png,
        media_type=media,
        headers={
            "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
            "ETag": etag,
        },
    )


def _sse_payload(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/{lobby_id}/events/stream")
async def stream_lobby_events(
    lobby_id: int,
    token: str = Query(...),
    after_id: int = 0,
    db: Session = Depends(get_db),
):
    """Server-Sent Events: pushes new lobby events live as the sync writes them.

    This is a read-only channel over our own `lobby_events` table — it never
    touches the LeetCode sync, so the number of external calls is unchanged.
    EventSource can't set an Authorization header, so the JWT rides in a query
    param; the membership check still gates access.
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        if payload.get("scope") != "sse":
            raise InvalidTokenError("Invalid stream scope")
        user_id = int(payload.get("sub"))
    except (InvalidTokenError, TypeError, ValueError):
        raise HTTPException(401, "Invalid token")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(401, "Invalid token")
    lobby = db.get(Lobby, lobby_id)
    if not lobby:
        raise HTTPException(404, "Lobby not found")
    _require_lobby_member(lobby, user.id, db)

    # Release the dependency session before streaming: an SSE connection can
    # stay open for hours, and holding `db` (an open transaction on `lobbies`,
    # `lobby_players`, ...) across it keeps an ACCESS lock that blocks future
    # DDL — e.g. `alembic upgrade` hangs forever on `ALTER TABLE lobbies`.
    db.close()

    async def event_generator():
        last_id = after_id
        status_sent = False
        while True:
            session = SessionLocal()
            try:
                for event in get_lobby_events(lobby_id, last_id, limit=100, db=session):
                    data = LobbyEventResponse.model_validate(event).model_dump(mode="json")
                    yield _sse_payload("event", data)
                    last_id = event.id
                current = session.get(Lobby, lobby_id)
                if current is not None and current.status == "finished" and not status_sent:
                    status_sent = True
                    yield _sse_payload("status", {"status": "finished"})
                    await asyncio.sleep(2)
                    return
            finally:
                session.close()
            await asyncio.sleep(1.0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
