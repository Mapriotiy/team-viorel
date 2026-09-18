from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.models.lobby import Lobby
from app.models.lobby_event import LobbyEvent
from app.models.lobby_map_province import LobbyMapProvince
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.services.game_modes import GAME_WON, finish_lobby, get_mode, winner_info
from app.services.game_modes.territory import TerritoryMode, _evaluate_winner


def make_lobby(faction_mode=False, win_condition=None, **kwargs) -> Lobby:
    return Lobby(
        id=1,
        creator_id=1,
        name="test",
        status="active",
        game_mode="team_battle" if faction_mode else "free_for_all",
        map_size="medium",
        max_players=0 if faction_mode else 4,
        faction_mode=faction_mode,
        faction_count=2 if faction_mode else 0,
        win_condition=win_condition or {"type": "territory_control", "threshold": 0.5},
        **kwargs,
    )


def make_province(i: int, region: str = "r1", captured_by=None, first_captured_by=None) -> LobbyMapProvince:
    return LobbyMapProvince(
        lobby_map_id=1,
        province_id=f"p{i}",
        region_id=region,
        problem_title_slug=f"slug-{i}",
        captured_by=captured_by,
        first_captured_by=first_captured_by,
    )


# ── Registry ──


def test_registry_resolves_territory_slugs():
    assert isinstance(get_mode("free_for_all"), TerritoryMode)
    assert isinstance(get_mode("team_battle"), TerritoryMode)


def test_registry_rejects_unknown_mode():
    with pytest.raises(HTTPException) as exc:
        get_mode("does_not_exist")
    assert exc.value.status_code == 400


# ── Win evaluation ──


def test_territory_threshold_win():
    lobby = make_lobby(win_condition={"type": "territory_control", "threshold": 0.5})
    provinces = [make_province(i, captured_by=1 if i < 5 else None) for i in range(10)]
    teams = {1: 1, 2: 2}

    result = _evaluate_winner(lobby, provinces, teams)
    assert result is not None
    assert result.winner_user_id == 1
    assert result.winner_faction_id is None
    assert result.reason == "territory_control"


def test_territory_below_threshold_is_no_win():
    lobby = make_lobby(win_condition={"type": "territory_control", "threshold": 0.5})
    provinces = [make_province(i, captured_by=1 if i < 4 else None) for i in range(10)]

    assert _evaluate_winner(lobby, provinces, {1: 1, 2: 2}) is None


def test_points_win():
    lobby = make_lobby(win_condition={"type": "points"})
    provinces = [
        make_province(1, captured_by=1, first_captured_by=1),
        make_province(2, captured_by=1, first_captured_by=1),
        make_province(3, captured_by=1, first_captured_by=1),
        make_province(4, captured_by=2, first_captured_by=2),
    ]
    difficulty = {f"slug-{i}": "Hard" for i in range(1, 5)}

    # 2 players -> 55% of the map's point potential (4 * 750 = 3000) = 1650.
    # Team 1 (3 Hard provinces with first-capture bonuses) reaches 2250.
    result = _evaluate_winner(lobby, provinces, {1: 1, 2: 2}, difficulty)
    assert result is not None
    assert result.winner_user_id == 1
    assert result.reason == "total_points"


def test_points_below_threshold_is_no_win():
    lobby = make_lobby(win_condition={"type": "points", "threshold": 5000})
    # A free province remains, so the game is still in progress.
    provinces = [make_province(1, captured_by=1), make_province(2, captured_by=None)]
    difficulty = {f"slug-{i}": "Hard" for i in range(1, 3)}

    assert _evaluate_winner(lobby, provinces, {1: 1, 2: 2}, difficulty) is None


def test_full_capture_crowns_leader_when_threshold_unreachable():
    lobby = make_lobby(win_condition={"type": "points", "threshold": 5000})
    # Entire map captured, but the 5000 absolute target is unreachable -> the
    # game must end anyway, with the current leader winning.
    provinces = [
        make_province(1, captured_by=1),
        make_province(2, captured_by=1),
        make_province(3, captured_by=2),
        make_province(4, captured_by=2),
    ]
    difficulty = {f"slug-{i}": "Hard" for i in range(1, 5)}

    result = _evaluate_winner(lobby, provinces, {1: 1, 2: 2}, difficulty)
    assert result is not None
    assert result.winner_user_id == 1
    assert result.reason == "full_capture"


def test_faction_win_reports_faction_not_user():
    lobby = make_lobby(faction_mode=True, win_condition={"type": "territory_control", "threshold": 0.5})
    # Users 1 and 2 are faction 1 and together own half the map.
    provinces = [make_province(i, captured_by=(1 if i % 2 else 2) if i < 6 else None) for i in range(10)]
    teams = {1: 1, 2: 1, 3: 2}

    result = _evaluate_winner(lobby, provinces, teams)
    assert result is not None
    assert result.winner_user_id is None
    assert result.winner_faction_id == 1


def test_region_domination_win():
    lobby = make_lobby(win_condition={"type": "region_domination"})
    provinces = [
        make_province(1, region="r1", captured_by=1),
        make_province(2, region="r1", captured_by=1),
        make_province(3, region="r2", captured_by=1),
        make_province(4, region="r3", captured_by=2),
    ]
    result = _evaluate_winner(lobby, provinces, {1: 1, 2: 2})
    assert result is not None
    assert result.winner_user_id == 1
    assert result.reason == "region_domination"


def test_region_domination_needs_strict_majority():
    lobby = make_lobby(win_condition={"type": "region_domination"})
    # 1 fully controls r1 of 2 regions: 1 of 2 is not a strict majority.
    provinces = [
        make_province(1, region="r1", captured_by=1),
        make_province(2, region="r2", captured_by=2),
        make_province(3, region="r2", captured_by=1),
    ]
    assert _evaluate_winner(lobby, provinces, {1: 1, 2: 2}) is None


# ── Finishing ──


def _seed_players(db, lobby, faction_ids):
    players = []
    for i, fid in enumerate(faction_ids, start=1):
        user = User(id=i, leetcode_username=f"user{i}", leetcode_verified_at=datetime(2026, 7, 27, 12, 0))
        lp = LobbyPlayer(lobby_id=lobby.id, user_id=i, faction_id=fid, status="ready")
        db.add(user)
        db.add(lp)
        players.append((lp, user))
    return players


def test_finish_lobby_free_for_all(db):
    lobby = make_lobby()
    db.add(lobby)
    players = _seed_players(db, lobby, [1, 2])
    db.flush()

    from app.services.game_modes import WinnerResult
    finish_lobby(lobby, WinnerResult(winner_user_id=2, winner_faction_id=None, reason="territory_control"), players, db)
    db.commit()

    assert lobby.status == "finished"
    assert lobby.winner_id == 2
    assert lobby.finished_at is not None
    event = db.query(LobbyEvent).filter_by(lobby_id=lobby.id, event_type=GAME_WON).one()
    assert event.actor_user_id == 2
    assert event.actor_username == "user2"
    assert event.province_id is None

    info = winner_info(lobby, db)
    assert info == {"winner_user_id": 2, "winner_faction_id": None, "label": "user2"}


def test_finish_lobby_faction(db):
    lobby = make_lobby(faction_mode=True)
    db.add(lobby)
    players = _seed_players(db, lobby, [1, 1, 2])
    db.flush()

    from app.services.game_modes import WinnerResult
    finish_lobby(lobby, WinnerResult(winner_user_id=None, winner_faction_id=2, reason="territory_control"), players, db)
    db.commit()

    assert lobby.winner_id is None
    assert lobby.winner_faction_id == 2
    event = db.query(LobbyEvent).filter_by(lobby_id=lobby.id, event_type=GAME_WON).one()
    assert event.actor_user_id == 3  # first member of faction 2
    assert event.actor_faction_id == 2

    info = winner_info(lobby, db)
    assert info["winner_faction_id"] == 2
    assert info["label"] == "Bravo"


def test_winner_info_none_while_running():
    lobby = make_lobby()
    assert winner_info(lobby, None) is None
