import asyncio
import json
from datetime import datetime, timezone

from app.core.config import settings
from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby import Lobby
from app.models.lobby_board_cell import LobbyBoardCell
from app.models.lobby_event import LobbyEvent
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.services.game_modes.bingo import (
    BINGO_LINE,
    BOARD_SIZE,
    CELL_CLAIMED,
    CELL_COUNT,
    LINES,
    BingoMode,
    _completed_line,
    _majority_winner,
)
from app.services.game_modes.base import GAME_WON

STARTED_AT = datetime(2026, 7, 27, 12, 0)


def make_lobby(faction_mode=False) -> Lobby:
    return Lobby(
        id=1,
        creator_id=1,
        name="bingo test",
        status="active",
        game_mode="bingo",
        map_size="medium",
        max_players=0 if faction_mode else 4,
        faction_mode=faction_mode,
        faction_count=2 if faction_mode else 0,
        win_condition={"programming_language": "python3"},
        started_at=STARTED_AT,
        created_at=STARTED_AT,
    )


def seed_users(db, lobby, faction_ids):
    players = []
    for i, fid in enumerate(faction_ids, start=1):
        user = User(
            id=i,
            leetcode_username=f"user{i}",
            leetcode_verified_at=STARTED_AT,
        )
        lp = LobbyPlayer(lobby_id=lobby.id, user_id=i, faction_id=fid, status="ready")
        db.add(user)
        db.add(lp)
        players.append((lp, user))
    return players


def seed_catalog(db, count=80):
    diffs = ["Easy", "Medium", "Hard"]
    for i in range(count):
        db.add(LeetCodeProblem(
            frontend_id=str(i + 1),
            title=f"Problem {i + 1}",
            title_slug=f"problem-{i + 1}",
            difficulty=diffs[i % 3],
            topic_tags=["array"],
        ))


def make_cell(lobby_id: int, index: int, claimed_by=None) -> LobbyBoardCell:
    return LobbyBoardCell(
        lobby_id=lobby_id,
        cell_index=index,
        problem_title_slug=f"problem-{index + 1}",
        claimed_by=claimed_by,
    )


def write_fake_submissions(tmp_path, data: dict) -> None:
    path = tmp_path / "fake_submissions.json"
    path.write_text(json.dumps(data))
    settings.leetcode_fake_submissions_path = str(path)


def fake_sub(sub_id: int, slug: str, ts_offset: int = 60) -> dict:
    ts = int(STARTED_AT.replace(tzinfo=timezone.utc).timestamp()) + ts_offset
    return {"id": sub_id, "title": slug, "titleSlug": slug, "timestamp": ts,
            "lang": "python3", "runtime": "100 ms"}


def run_sync(lobby, players, db):
    return asyncio.run(BingoMode().sync(lobby, players, db))


# ── Board geometry ──


def test_lines_cover_rows_columns_and_diagonals():
    assert len(LINES) == 2 * BOARD_SIZE + 2
    assert all(len(line) == BOARD_SIZE for line in LINES)
    assert [0, 6, 12, 18, 24] in LINES
    assert [4, 8, 12, 16, 20] in LINES


def test_completed_line_detection():
    cells = [make_cell(1, i, claimed_by=1 if i in (0, 1, 2, 3, 4) else None)
             for i in range(CELL_COUNT)]
    assert _completed_line(cells, {1: 1}, 1) == [0, 1, 2, 3, 4]
    assert _completed_line(cells, {1: 1}, 2) is None


def test_faction_line_completed_by_teammates():
    # Cells of column 0 split between users 1 and 2, same faction.
    owners = {0: 1, 5: 2, 10: 1, 15: 2, 20: 1}
    cells = [make_cell(1, i, claimed_by=owners.get(i)) for i in range(CELL_COUNT)]
    teams = {1: 7, 2: 7}
    assert _completed_line(cells, teams, 7) == [0, 5, 10, 15, 20]


# ── Board generation ──


def test_start_builds_unique_unsolved_board(db, monkeypatch):
    monkeypatch.setattr(settings, "leetcode_fake_submissions_path", None)
    lobby = make_lobby()
    db.add(lobby)
    players = seed_users(db, lobby, [1, 2])
    seed_catalog(db)
    db.flush()

    from app.models.user_solved import UserSolved
    db.add(UserSolved(user_id=1, title_slug="problem-1", language="python3",
                      solved_at=datetime(2026, 1, 1)))
    db.flush()

    asyncio.run(BingoMode().start(lobby, players, db))
    db.commit()

    cells = db.query(LobbyBoardCell).filter_by(lobby_id=lobby.id).all()
    assert len(cells) == CELL_COUNT
    slugs = [c.problem_title_slug for c in cells]
    assert len(set(slugs)) == CELL_COUNT
    assert "problem-1" not in slugs  # already solved pre-game

    difficulties = [
        db.query(LeetCodeProblem).filter_by(title_slug=slug).one().difficulty
        for slug in slugs
    ]
    assert difficulties.count("Easy") == 12
    assert difficulties.count("Medium") == 9
    assert difficulties.count("Hard") == 4


# ── Claims and winning ──


def _setup_game(db, faction_ids=(1, 2)):
    lobby = make_lobby()
    db.add(lobby)
    players = seed_users(db, lobby, list(faction_ids))
    seed_catalog(db)
    for i in range(CELL_COUNT):
        db.add(make_cell(lobby.id, i))
    db.flush()
    return lobby, players


def test_line_win_finishes_game_and_stops_later_claims(db, tmp_path):
    lobby, players = _setup_game(db)
    row0_slugs = [f"problem-{i + 1}" for i in range(5)]

    write_fake_submissions(tmp_path, {
        # user1 completes row 0; user2 solves another cell LATER — it must
        # not be claimed because the game ends first.
        "user1": [fake_sub(i, slug, ts_offset=60 + i) for i, slug in enumerate(row0_slugs)],
        "user2": [fake_sub(99, "problem-10", ts_offset=600)],
    })
    try:
        payload = run_sync(lobby, players, db)
    finally:
        settings.leetcode_fake_submissions_path = None

    assert lobby.status == "finished"
    assert lobby.winner_id == 1
    assert payload["winner"]["label"] == "user1"
    assert payload["winning_line"] == [0, 1, 2, 3, 4]
    assert payload["claimed_count"] == 5

    cell10 = db.query(LobbyBoardCell).filter_by(lobby_id=lobby.id, cell_index=9).one()
    assert cell10.claimed_by is None  # user2's later solve did not land

    kinds = [e.event_type for e in db.query(LobbyEvent).order_by(LobbyEvent.id).all()]
    assert kinds.count(CELL_CLAIMED) == 5
    assert kinds[-2:] == [BINGO_LINE, GAME_WON]


def test_earliest_solver_claims_contested_cell(db, tmp_path):
    lobby, players = _setup_game(db)

    write_fake_submissions(tmp_path, {
        "user1": [fake_sub(1, "problem-1", ts_offset=120)],
        "user2": [fake_sub(2, "problem-1", ts_offset=60)],  # earlier
    })
    try:
        run_sync(lobby, players, db)
    finally:
        settings.leetcode_fake_submissions_path = None

    cell = db.query(LobbyBoardCell).filter_by(lobby_id=lobby.id, cell_index=0).one()
    assert cell.claimed_by == 2


def test_pre_game_solve_does_not_claim(db, tmp_path):
    lobby, players = _setup_game(db)

    write_fake_submissions(tmp_path, {
        "user1": [fake_sub(1, "problem-1", ts_offset=-3600)],  # before start
    })
    try:
        payload = run_sync(lobby, players, db)
    finally:
        settings.leetcode_fake_submissions_path = None

    assert payload["claimed_count"] == 0
    cell = db.query(LobbyBoardCell).filter_by(lobby_id=lobby.id, cell_index=0).one()
    assert cell.claimed_by is None


# ── Full-board fallback ──


def test_majority_wins_full_board():
    lobby = make_lobby()
    cells = [make_cell(1, i, claimed_by=1 if i < 13 else 2) for i in range(CELL_COUNT)]
    result = _majority_winner(lobby, cells, {1: 1, 2: 2})
    assert result.winner_user_id == 1
    assert result.reason == "cell_majority"


def test_exact_tie_is_a_draw():
    lobby = make_lobby()
    # 12 vs 12 claimed, one cell claimed by an unknown (left) user.
    cells = [make_cell(1, i, claimed_by=1 if i < 12 else 2 if i < 24 else 99)
             for i in range(CELL_COUNT)]
    result = _majority_winner(lobby, cells, {1: 1, 2: 2})
    assert result.winner_user_id is None
    assert result.winner_faction_id is None
    assert result.reason == "draw"


def test_faction_majority_reports_faction():
    lobby = make_lobby(faction_mode=True)
    cells = [make_cell(1, i, claimed_by=1 if i % 2 else 2) for i in range(CELL_COUNT)]
    # Both users on faction 3: it owns every cell.
    result = _majority_winner(lobby, cells, {1: 3, 2: 3})
    assert result.winner_faction_id == 3
    assert result.winner_user_id is None
