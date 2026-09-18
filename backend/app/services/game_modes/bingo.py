"""Bingo game mode: a 5x5 board of tasks instead of a map.

Cells are claimed permanently by the first eligible solver (no runtime
recapture — a steal could retroactively un-complete a line after the win
already fired). The first player/faction to complete a full row, column,
or diagonal wins instantly. If the board fills with no line, the team with
the most cells wins; an exact tie is a draw.
"""

import logging
import random
from datetime import timezone

from sqlalchemy.orm import Session

from app.models.lobby import Lobby
from app.models.lobby_board_cell import LobbyBoardCell
from app.models.lobby_event import LobbyEvent
from app.services.game_modes.base import (
    GameMode,
    Players,
    WinnerResult,
    finish_lobby,
    winner_info,
)
from app.services.game_modes.registry import register
from app.services.leetcode_sync import fetch_lobby_recent_submissions
from app.services.lobby_settings import (
    FACTION_COLORS,
    lobby_factions,
    lobby_programming_language,
    team_by_user,
)
from app.services.problem_picker import pick_problem
from app.services.scoring import flag_points
from app.services.user_solved import (
    get_solved_for_slugs,
    get_solved_slugs_with_timestamps,
    record_submissions,
)

logger = logging.getLogger(__name__)

CELL_CLAIMED = "cell_claimed"
BINGO_LINE = "bingo_line"

BOARD_SIZE = 5
CELL_COUNT = BOARD_SIZE * BOARD_SIZE
# 12 Easy / 9 Medium / 4 Hard across the 25 cells.
DIFFICULTY_MIX = ["Easy"] * 12 + ["Medium"] * 9 + ["Hard"] * 4

LINES: list[list[int]] = (
    [[r * BOARD_SIZE + c for c in range(BOARD_SIZE)] for r in range(BOARD_SIZE)]
    + [[r * BOARD_SIZE + c for r in range(BOARD_SIZE)] for c in range(BOARD_SIZE)]
    + [
        [i * BOARD_SIZE + i for i in range(BOARD_SIZE)],
        [i * BOARD_SIZE + (BOARD_SIZE - 1 - i) for i in range(BOARD_SIZE)],
    ]
)


class BingoMode(GameMode):
    slugs = ("bingo",)

    async def start(self, lobby: Lobby, players: Players, db: Session) -> None:
        language = lobby_programming_language(lobby)
        exclude: set[str] = set()
        for _, u in players:
            exclude.update(
                get_solved_slugs_with_timestamps(u.id, db, language=language).keys()
            )

        mix = list(DIFFICULTY_MIX)
        random.shuffle(mix)
        for cell_index, difficulty in enumerate(mix):
            prob = pick_problem([], difficulty, exclude, db)
            if not prob:
                prob = pick_problem([], None, exclude, db)
            if not prob:
                continue
            exclude.add(prob.title_slug)
            db.add(LobbyBoardCell(
                lobby_id=lobby.id,
                cell_index=cell_index,
                problem_title_slug=prob.title_slug,
            ))

    async def sync(self, lobby: Lobby, players: Players, db: Session) -> dict:
        cells = _get_cells(lobby.id, db)
        if not cells:
            return self._payload(lobby, [], players, db)

        language = lobby_programming_language(lobby)
        submissions_by_user, player_sync = await fetch_lobby_recent_submissions(players, language, db)
        for _, u in players:
            subs = submissions_by_user.get(u.id, [])
            if subs:
                record_submissions(u.id, subs, db)

        slugs = {c.problem_title_slug for c in cells}
        solved_by_user = {
            u.id: get_solved_for_slugs(u.id, slugs, db, language=language)
            for _, u in players
        }
        username_by_id = {u.id: u.leetcode_username for _, u in players}
        rank = {u.id: i for i, (_, u) in enumerate(players)}
        teams = team_by_user(lobby, players)
        # UserSolved timestamps are naive UTC; normalize aware inputs to match.
        since = lobby.started_at or lobby.created_at
        if since.tzinfo is not None:
            since = since.astimezone(timezone.utc).replace(tzinfo=None)

        # All possible claims, in chronological order (ties by join order).
        claims: list[tuple] = []
        for cell in cells:
            if cell.claimed_by is not None:
                continue
            for user_id, solved in solved_by_user.items():
                row = solved.get(cell.problem_title_slug)
                if row is None or row.solved_at < since:
                    continue
                claims.append((row.solved_at, rank.get(user_id, len(rank)), cell, user_id, row))
        claims.sort(key=lambda c: (c[0], c[1]))

        problems = _load_problems(slugs, db)
        claimed_count = 0
        claimed_this_pass: set[int] = set()
        winner: WinnerResult | None = None

        for solved_at, _, cell, user_id, row in claims:
            if cell.cell_index in claimed_this_pass:
                continue
            cell.claimed_by = user_id
            cell.claimed_at = solved_at
            cell.claimed_submission_url = row.best_submission_url
            cell.claimer_leetcode_username = username_by_id.get(user_id, "?")
            claimed_this_pass.add(cell.cell_index)
            claimed_count += 1
            _record_cell_event(lobby, cell, user_id, players, problems, db)

            line = _completed_line(cells, teams, teams.get(user_id, user_id))
            if line is not None:
                winner = _winner_result(lobby, teams.get(user_id, user_id))
                _record_line_event(lobby, cell, user_id, players, db)
                # First completed line ends the game; later solves in this
                # same pass no longer count.
                break

        if winner is None and all(c.claimed_by is not None for c in cells):
            winner = _majority_winner(lobby, cells, teams)

        if winner is not None:
            finish_lobby(lobby, winner, players, db)

        if claimed_count or winner is not None:
            db.commit()

        payload = self._payload(lobby, cells, players, db, problems=problems,
                                claimed_count=claimed_count)
        payload["player_sync"] = player_sync
        return payload

    def get_state(self, lobby: Lobby, players: Players, db: Session) -> dict:
        return self._payload(lobby, _get_cells(lobby.id, db), players, db)

    def _payload(
        self,
        lobby: Lobby,
        cells: list[LobbyBoardCell],
        players: Players,
        db: Session,
        problems: dict | None = None,
        claimed_count: int = 0,
    ) -> dict:
        if problems is None:
            problems = _load_problems({c.problem_title_slug for c in cells}, db)
        teams = team_by_user(lobby, players)

        return {
            "lobby_id": lobby.id,
            "game_mode": lobby.game_mode,
            "status": lobby.status,
            "winner": winner_info(lobby, db),
            "claimed_count": claimed_count,
            "board_size": BOARD_SIZE,
            "cells": [_build_cell(c, problems, teams) for c in cells],
            "score": _score_entries(lobby, cells, players, teams),
            "winning_line": _winning_line(lobby, cells, teams),
        }


def _get_cells(lobby_id: int, db: Session) -> list[LobbyBoardCell]:
    return (
        db.query(LobbyBoardCell)
        .filter_by(lobby_id=lobby_id)
        .order_by(LobbyBoardCell.cell_index.asc())
        .all()
    )


def _load_problems(slugs: set[str], db: Session) -> dict:
    from app.models.leetcode_problem import LeetCodeProblem

    if not slugs:
        return {}
    return {
        p.title_slug: p
        for p in db.query(LeetCodeProblem).filter(LeetCodeProblem.title_slug.in_(slugs)).all()
    }


def _build_cell(cell: LobbyBoardCell, problems: dict, teams: dict[int, int]) -> dict:
    prob = problems.get(cell.problem_title_slug)
    return {
        "cell_index": cell.cell_index,
        "row": cell.cell_index // BOARD_SIZE,
        "col": cell.cell_index % BOARD_SIZE,
        "problem": {
            "title": prob.title,
            "title_slug": prob.title_slug,
            "difficulty": prob.difficulty,
            "url": f"https://leetcode.com/problems/{prob.title_slug}/",
        } if prob else None,
        "claimed_by": cell.claimed_by,
        "claimed_team_id": teams.get(cell.claimed_by) if cell.claimed_by else None,
        "claimed_at": cell.claimed_at,
        "claimed_submission_url": cell.claimed_submission_url,
        "claimer_leetcode_username": cell.claimer_leetcode_username,
    }


def _score_entries(
    lobby: Lobby,
    cells: list[LobbyBoardCell],
    players: Players,
    teams: dict[int, int],
) -> list[dict]:
    cell_counts: dict[int, int] = {}
    for cell in cells:
        if cell.claimed_by is not None and cell.claimed_by in teams:
            team = teams[cell.claimed_by]
            cell_counts[team] = cell_counts.get(team, 0) + 1

    entries: list[dict] = []
    if lobby.faction_mode:
        for faction in lobby_factions(lobby):
            entries.append({
                "team_id": faction["id"],
                "label": faction["name"],
                "color": faction["color"],
                "cells": cell_counts.get(faction["id"], 0),
            })
    else:
        for lp, u in players:
            entries.append({
                "team_id": u.id,
                "label": u.leetcode_username,
                "color": FACTION_COLORS.get(lp.faction_id, "#888888"),
                "cells": cell_counts.get(u.id, 0),
            })

    entries.sort(key=lambda e: e["cells"], reverse=True)
    return entries


def _cells_by_index(cells: list[LobbyBoardCell]) -> dict[int, LobbyBoardCell]:
    return {c.cell_index: c for c in cells}


def _completed_line(
    cells: list[LobbyBoardCell],
    teams: dict[int, int],
    team: int,
) -> list[int] | None:
    by_index = _cells_by_index(cells)
    for line in LINES:
        if all(
            (cell := by_index.get(i)) is not None
            and cell.claimed_by is not None
            and teams.get(cell.claimed_by) == team
            for i in line
        ):
            return line
    return None


def _winning_line(
    lobby: Lobby,
    cells: list[LobbyBoardCell],
    teams: dict[int, int],
) -> list[int] | None:
    if lobby.status != "finished":
        return None
    winning_team = lobby.winner_faction_id if lobby.faction_mode else lobby.winner_id
    if winning_team is None:
        return None
    return _completed_line(cells, teams, winning_team)


def _majority_winner(
    lobby: Lobby,
    cells: list[LobbyBoardCell],
    teams: dict[int, int],
) -> WinnerResult:
    counts: dict[int, int] = {}
    for cell in cells:
        if cell.claimed_by is not None and cell.claimed_by in teams:
            team = teams[cell.claimed_by]
            counts[team] = counts.get(team, 0) + 1

    if not counts:
        return WinnerResult(winner_user_id=None, winner_faction_id=None, reason="draw")
    ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
    if len(ranked) > 1 and ranked[0][1] == ranked[1][1]:
        return WinnerResult(winner_user_id=None, winner_faction_id=None, reason="draw")
    return _winner_result(lobby, ranked[0][0], reason="cell_majority")


def _winner_result(lobby: Lobby, team: int, reason: str = "bingo_line") -> WinnerResult:
    if lobby.faction_mode:
        return WinnerResult(winner_user_id=None, winner_faction_id=team, reason=reason)
    return WinnerResult(winner_user_id=team, winner_faction_id=None, reason=reason)


def _record_cell_event(
    lobby: Lobby,
    cell: LobbyBoardCell,
    user_id: int,
    players: Players,
    problems: dict,
    db: Session,
) -> None:
    prob = problems.get(cell.problem_title_slug)
    db.add(LobbyEvent(
        lobby_id=lobby.id,
        province_id=f"cell{cell.cell_index}",
        event_type=CELL_CLAIMED,
        actor_user_id=user_id,
        actor_username=cell.claimer_leetcode_username or "?",
        actor_faction_id=_faction_of(lobby, players, user_id),
        problem_title_slug=cell.problem_title_slug,
        problem_title=prob.title if prob else None,
        problem_difficulty=prob.difficulty if prob else None,
        points=flag_points(prob.difficulty if prob else None),
    ))


def _record_line_event(
    lobby: Lobby,
    cell: LobbyBoardCell,
    user_id: int,
    players: Players,
    db: Session,
) -> None:
    db.add(LobbyEvent(
        lobby_id=lobby.id,
        province_id=f"cell{cell.cell_index}",
        event_type=BINGO_LINE,
        actor_user_id=user_id,
        actor_username=cell.claimer_leetcode_username or "?",
        actor_faction_id=_faction_of(lobby, players, user_id),
        problem_title_slug=cell.problem_title_slug,
    ))


def _faction_of(lobby: Lobby, players: Players, user_id: int) -> int | None:
    if not lobby.faction_mode:
        return None
    return next((lp.faction_id for lp, u in players if u.id == user_id), None)


register(BingoMode())
