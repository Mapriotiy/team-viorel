"""Territory game mode: capture map provinces by solving their problems.

The classic CTF rules — runtime defense, strictly-faster recapture,
first-capture ledger, region-control bonus — over the 28-province map.
Handles both free-for-all and faction (team_battle) lobbies; the split is
data-driven off lobby.faction_mode.
"""

import logging
import random
from collections import Counter

from sqlalchemy.orm import Session

from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby import Lobby
from app.models.lobby_map import LobbyMap
from app.models.lobby_map_province import LobbyMapProvince
from app.models.user import User
from app.schemas.lobby import LobbyMapProvinceResponse, LobbyScoreEntry
from app.services.capture_engine import CAPTURE, RECAPTURE, apply_capture_pass
from app.services.events import record_lobby_events, region_control_changes
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
from app.services.map_config import (
    REGION_TOPICS,
    build_default_map_draft,
)
from app.services.powerups import grant_region_powerup, is_fortified, powerup_counts
from app.services.problem_picker import pick_problem
from app.services.problem_catalog import get_problems_by_tags
from app.services.scoring import (
    TeamScore,
    compute_team_scores,
    first_capture_bonus,
    flag_points,
    region_control_by_team,
)
from app.services.user_solved import (
    get_solved_for_slugs,
    get_solved_slugs_with_timestamps,
    record_submissions,
)

logger = logging.getLogger(__name__)


class TerritoryMode(GameMode):
    slugs = ("free_for_all", "team_battle")

    async def start(self, lobby: Lobby, players: Players, db: Session) -> None:
        language = lobby_programming_language(lobby)
        all_solved: set[str] = set()
        for _, u in players:
            all_solved.update(
                get_solved_slugs_with_timestamps(u.id, db, language=language).keys()
            )

        selection = _normalize_map_selection(lobby.map_config)
        if not _start_generated_map(lobby, selection, all_solved, db):
            logger.warning("Map config for lobby %s is invalid or empty; using the default map", lobby.id)
            _start_generated_map(lobby, _default_map_selection(), all_solved, db)

    async def sync(self, lobby: Lobby, players: Players, db: Session) -> dict:
        lmap = _get_lmap(lobby.id, db)
        if not lmap:
            return self._payload(lobby, [], [], db)

        language = lobby_programming_language(lobby)
        submissions_by_user, player_sync = await fetch_lobby_recent_submissions(players, language, db)
        for _, u in players:
            subs = submissions_by_user.get(u.id, [])
            if subs:
                record_submissions(u.id, subs, db)

        provinces = _get_lmap_provinces(lmap.id, db)
        slugs = {p.problem_title_slug for p in provinces}

        solved_by_user = {
            u.id: get_solved_for_slugs(u.id, slugs, db, language=language)
            for _, u in players
        }
        username_by_id = {u.id: u.leetcode_username for _, u in players}
        teams = team_by_user(lobby, players)
        control_before = region_control_by_team(provinces, teams)

        changes = apply_capture_pass(
            provinces=provinces,
            solved_by_user=solved_by_user,
            username_by_id=username_by_id,
            since=lobby.started_at or lobby.created_at,
            tiebreak_order=[u.id for _, u in players],
            team_by_user=teams,
            blocked_recapture_ids={p.province_id for p in provinces if is_fortified(p)},
        )
        if changes:
            db.commit()

        problems = _load_problems(slugs, db)

        if changes:
            control_after = region_control_by_team(provinces, teams)
            _grant_region_powerups(
                lobby, provinces, players, teams, control_before, control_after, changes, db,
            )
            all_changes = changes + region_control_changes(
                provinces, changes, control_before, control_after,
            )
            record_lobby_events(
                all_changes,
                lobby,
                problems,
                username_by_id,
                {u.id: (lp.faction_id if lobby.faction_mode else None) for lp, u in players},
                db,
            )

            winner = _evaluate_winner(
                lobby,
                provinces,
                teams,
                difficulty_by_slug={
                    slug: prob.difficulty
                    for slug, prob in problems.items()
                    if prob.difficulty
                },
            )
            if winner is not None:
                finish_lobby(lobby, winner, players, db)
                db.commit()

        payload = self._payload(
            lobby, provinces, players, db, problems=problems, lmap=lmap,
            captured_count=sum(1 for c in changes if c.kind == CAPTURE),
            recaptured_count=sum(1 for c in changes if c.kind == RECAPTURE),
        )
        payload["player_sync"] = player_sync
        return payload

    def get_state(self, lobby: Lobby, players: Players, db: Session) -> dict:
        lmap = _get_lmap(lobby.id, db)
        if not lmap:
            return self._payload(lobby, [], [], db)
        provinces = _get_lmap_provinces(lmap.id, db)
        return self._payload(lobby, provinces, players, db, lmap=lmap)

    def _payload(
        self,
        lobby: Lobby,
        provinces: list[LobbyMapProvince],
        players: Players,
        db: Session,
        problems: dict[str, LeetCodeProblem] | None = None,
        lmap: LobbyMap | None = None,
        captured_count: int = 0,
        recaptured_count: int = 0,
    ) -> dict:
        if problems is None:
            problems = _load_problems({p.problem_title_slug for p in provinces}, db)
        uids = {p.captured_by for p in provinces if p.captured_by}
        users = (
            {u.id: u.leetcode_username for u in db.query(User).filter(User.id.in_(uids)).all()}
            if uids else {}
        )
        win_condition = lobby.win_condition or {}
        teams = team_by_user(lobby, players)
        win_target = (
            _points_win_threshold(
                win_condition,
                provinces,
                teams,
                {slug: prob.difficulty for slug, prob in problems.items() if prob.difficulty},
            )
            if str(win_condition.get("type") or "") == "points"
            else None
        )
        return {
            "lobby_id": lobby.id,
            "game_mode": lobby.game_mode,
            "status": lobby.status,
            "winner": winner_info(lobby, db),
            "captured_count": captured_count,
            "recaptured_count": recaptured_count,
            "map_selection": _active_map_selection(lmap),
            "provinces": [_build_province(p, problems, users) for p in provinces],
            "score": _score_entries(lobby, provinces, players, problems),
            "powerups": {lp.user_id: powerup_counts(lp) for lp, _ in players},
            "win_target": win_target,
        }


def _default_map_selection() -> dict:
    return {"kind": "generated", "draft": build_default_map_draft()}


def _normalize_map_selection(value: object) -> dict:
    if not isinstance(value, dict):
        return _default_map_selection()
    if value.get("kind") != "generated":
        return _default_map_selection()
    draft = value.get("draft")
    if not isinstance(draft, dict):
        return _default_map_selection()
    return {"kind": "generated", "draft": draft}


def _active_map_selection(lmap: LobbyMap | None) -> dict:
    if not lmap:
        return _default_map_selection()
    return _normalize_map_selection(lmap.map_config)


def _get_lmap(lobby_id: int, db: Session) -> LobbyMap | None:
    return db.query(LobbyMap).filter_by(lobby_id=lobby_id).first()


def _get_lmap_provinces(lobby_map_id: int, db: Session) -> list[LobbyMapProvince]:
    return (
        db.query(LobbyMapProvince)
        .filter_by(lobby_map_id=lobby_map_id)
        .order_by(LobbyMapProvince.order_index.asc(), LobbyMapProvince.id.asc())
        .all()
    )


def _difficulty_plan(total: int, hard_indices: set[int] | None = None) -> list[str]:
    if total <= 0:
        return []

    easy_target = round(total * 0.50)
    medium_target = round(total * 0.35)
    hard_target = max(0, total - easy_target - medium_target)
    hard_indices = set(hard_indices or set())

    difficulties = ["Easy"] * easy_target + ["Medium"] * medium_target + ["Hard"] * hard_target
    random.shuffle(difficulties)

    if not hard_indices or hard_target == 0:
        return difficulties

    for hard_index in list(hard_indices)[:hard_target]:
        if hard_index < 0 or hard_index >= len(difficulties) or difficulties[hard_index] == "Hard":
            continue
        swap_index = next((index for index, value in enumerate(difficulties) if value == "Hard"), None)
        if swap_index is None:
            break
        difficulties[hard_index], difficulties[swap_index] = difficulties[swap_index], difficulties[hard_index]

    return difficulties


def _random_problem(candidates: list[LeetCodeProblem]) -> LeetCodeProblem | None:
    return random.choice(candidates) if candidates else None


def _pick_for_region(
    region_id: str,
    topic_id: str | None,
    target_difficulty: str,
    used: set[str],
    all_solved: set[str],
    db: Session,
) -> LeetCodeProblem | None:
    cfg = REGION_TOPICS.get(topic_id or "") or REGION_TOPICS.get(region_id) or {"tags": [], "difficulty": None}
    exclude = all_solved | used
    tags = cfg["tags"]

    # Keep the 50/35/15 lobby-wide difficulty budget as the first priority.
    # Topic matching is preferred, but a missing topic+difficulty bucket should
    # not silently turn the map into a hard-heavy roll.
    prob = _random_problem(get_problems_by_tags(tags, target_difficulty, exclude, db))
    if not prob:
        prob = _random_problem(get_problems_by_tags([], target_difficulty, exclude, db))
    if not prob:
        prob = _random_problem(get_problems_by_tags(tags, None, exclude, db))
    if not prob:
        prob = pick_problem([], None, exclude, db)
    return prob


def _region_text(region: dict, key: str) -> str | None:
    value = region.get(key)
    return str(value) if value else None


def _start_generated_map(lobby: Lobby, selection: dict, all_solved: set[str], db: Session) -> bool:
    draft = selection.get("draft")
    if not isinstance(draft, dict):
        return False

    provinces = draft.get("provinces")
    regions = draft.get("regions")
    if not isinstance(provinces, list) or not provinces or not isinstance(regions, list):
        return False

    region_by_id = {
        str(region.get("regionId")): region
        for region in regions
        if isinstance(region, dict) and region.get("regionId")
    }
    if not region_by_id:
        return False

    rows: list[dict] = []
    used_problem_slugs: set[str] = set()
    used_province_ids: set[str] = set()
    hard_indices = set()
    for order_index, province in enumerate(provinces):
        if not isinstance(province, dict):
            continue
        region = region_by_id.get(str(province.get("regionId"))) or {}
        topic_id = _region_text(region, "topicId") or str(province.get("regionId") or "")
        if REGION_TOPICS.get(topic_id, {}).get("difficulty") == "Hard":
            hard_indices.add(order_index)

    difficulties = _difficulty_plan(len(provinces), hard_indices)

    for order_index, province in enumerate(provinces):
        if not isinstance(province, dict):
            continue
        province_id = province.get("provinceId")
        region_id = province.get("regionId")
        if not province_id or not region_id:
            continue
        province_id = str(province_id)
        region_id = str(region_id)
        if province_id in used_province_ids:
            continue

        region = region_by_id.get(region_id) or {}
        topic_id = _region_text(region, "topicId") or region_id
        target_difficulty = difficulties[order_index] if order_index < len(difficulties) else "Medium"
        prob = _pick_for_region(region_id, topic_id, target_difficulty, used_problem_slugs, all_solved, db)
        if not prob:
            continue

        used_problem_slugs.add(prob.title_slug)
        used_province_ids.add(province_id)
        rows.append({
            "province_id": province_id,
            "province_name": str(province.get("name") or province_id),
            "region_id": region_id,
            "region_name": _region_text(region, "name"),
            "topic_id": topic_id,
            "order_index": order_index,
            "problem_title_slug": prob.title_slug,
        })

    if not rows:
        return False

    map_size = str(draft.get("size") or lobby.map_size)
    lmap = LobbyMap(
        lobby_id=lobby.id,
        map_size=map_size,
        map_kind="generated",
        map_config=selection,
    )
    db.add(lmap)
    db.flush()

    for row in rows:
        db.add(LobbyMapProvince(lobby_map_id=lmap.id, **row))
    return True


def _load_problems(slugs: set[str], db: Session) -> dict[str, LeetCodeProblem]:
    if not slugs:
        return {}
    return {
        p.title_slug: p
        for p in db.query(LeetCodeProblem).filter(LeetCodeProblem.title_slug.in_(slugs)).all()
    }


def _build_province(p: LobbyMapProvince, problems: dict, users: dict) -> LobbyMapProvinceResponse:
    prob = problems.get(p.problem_title_slug)
    return LobbyMapProvinceResponse(
        province_id=p.province_id,
        region_id=p.region_id,
        province_name=p.province_name,
        region_name=p.region_name,
        problem={"title": prob.title, "title_slug": prob.title_slug, "difficulty": prob.difficulty,
                 "url": f"https://leetcode.com/problems/{prob.title_slug}/"} if prob else None,
        captured_by=p.captured_by,
        captured_by_username=users.get(p.captured_by) if p.captured_by else None,
        captured_at=p.captured_at,
        captured_runtime_ms=p.captured_runtime_ms,
        captured_submission_url=p.captured_submission_url,
        capturer_leetcode_username=p.capturer_leetcode_username,
        first_captured_by=p.first_captured_by,
        fortified_until=p.fortified_until,
    )


def _grant_region_powerups(
    lobby: Lobby,
    provinces: list[LobbyMapProvince],
    players: Players,
    teams: dict[int, int],
    control_before: dict[str, int],
    control_after: dict[str, int],
    changes,
    db: Session,
) -> None:
    """Grant a power-up to the player who completes a region, once per region."""
    lp_by_user = {lp.user_id: lp for lp, _ in players}
    for region_id, team in control_after.items():
        if control_before.get(region_id) == team:
            continue
        actor_id = next(
            (
                change.actor_user_id
                for change in changes
                if change.province.region_id == region_id
                and teams.get(change.actor_user_id) == team
            ),
            None,
        )
        if actor_id is None:
            actor_id = next(
                (
                    province.captured_by
                    for province in provinces
                    if province.region_id == region_id
                    and province.captured_by
                    and teams.get(province.captured_by) == team
                ),
                None,
            )
        if actor_id is None or actor_id not in lp_by_user:
            continue
        if grant_region_powerup(lp_by_user[actor_id], region_id):
            db.commit()


def _score_entries(
    lobby: Lobby,
    provinces: list[LobbyMapProvince],
    players: Players,
    problems: dict,
) -> list[LobbyScoreEntry]:
    difficulty_by_slug = {
        slug: prob.difficulty for slug, prob in problems.items() if prob.difficulty
    }
    team_scores = compute_team_scores(provinces, team_by_user(lobby, players), difficulty_by_slug)

    entries: list[LobbyScoreEntry] = []
    if lobby.faction_mode:
        for faction in lobby_factions(lobby):
            score = team_scores.get(faction["id"], TeamScore())
            entries.append(_score_entry(faction["id"], faction["name"], faction["color"], score))
    else:
        for lp, u in players:
            score = team_scores.get(u.id, TeamScore())
            entries.append(_score_entry(
                u.id, u.leetcode_username, FACTION_COLORS.get(lp.faction_id, "#888888"), score,
            ))

    entries.sort(key=lambda e: e.total_points, reverse=True)
    return entries


def _score_entry(team_id: int, label: str, color: str, score: TeamScore) -> LobbyScoreEntry:
    return LobbyScoreEntry(
        team_id=team_id,
        label=label,
        color=color,
        provinces=score.provinces,
        base_points=score.base_points,
        bonus_points=score.bonus_points,
        region_control_points=score.region_control_points,
        total_points=score.total_points,
    )


def _points_win_ratio(player_count: int) -> float:
    """Share of the map's total points needed to win, scaled by players."""
    if player_count >= 6:
        return 0.33
    if player_count == 5:
        return 0.36
    if player_count == 4:
        return 0.40
    if player_count == 3:
        return 0.45
    return 0.55


def _map_total_points(
    provinces: list[LobbyMapProvince],
    difficulty_by_slug: dict[str, str] | None,
) -> int:
    """Deterministic point potential of the map: flags + first-capture bonuses."""
    difficulty_by_slug = difficulty_by_slug or {}
    total = 0
    for province in provinces:
        difficulty = difficulty_by_slug.get(province.problem_title_slug)
        total += flag_points(difficulty) + first_capture_bonus(difficulty)
    return total


def _points_win_threshold(
    win_condition: dict,
    provinces: list[LobbyMapProvince],
    teams: dict[int, int],
    difficulty_by_slug: dict[str, str] | None,
) -> int | None:
    """Win target for a points game: a share of the map's point potential.

    Defaults to a ratio that scales with player count; an explicit `ratio`
    overrides it. Legacy absolute `threshold` values (from the old 5000-point
    default) are ignored so every lobby behaves consistently.
    """
    map_total = _map_total_points(provinces, difficulty_by_slug)
    ratio = win_condition.get("ratio")
    if ratio is None:
        ratio = _points_win_ratio(len({team for team in teams.values()}))
    try:
        return round(float(ratio) * map_total) if map_total else None
    except (TypeError, ValueError):
        return None


def _full_capture_leader(
    lobby: Lobby,
    provinces: list[LobbyMapProvince],
    teams: dict[int, int],
    difficulty_by_slug: dict[str, str] | None,
) -> WinnerResult | None:
    """Deadlock guard: the map is fully owned but no win condition fired, so
    the game can't progress — crown the current points leader."""
    if not provinces:
        return None
    captured_count = sum(1 for p in provinces if p.captured_by and p.captured_by in teams)
    if captured_count != len(provinces):
        return None
    scores = compute_team_scores(provinces, teams, difficulty_by_slug or {})
    if not scores:
        return None
    leader = max(scores, key=lambda team_id: (scores[team_id].total_points, -team_id))
    return _winner_result(lobby, leader, "full_capture")


def _evaluate_winner(
    lobby: Lobby,
    provinces: list[LobbyMapProvince],
    teams: dict[int, int],
    difficulty_by_slug: dict[str, str] | None = None,
) -> WinnerResult | None:
    total = len(provinces)
    if total == 0:
        return None

    win_condition = lobby.win_condition or {}
    wc_type = str(win_condition.get("type") or "territory_control")

    if wc_type == "region_domination":
        control = region_control_by_team(provinces, teams)
        total_regions = len({p.region_id for p in provinces})
        needed = total_regions // 2 + 1
        counts = Counter(control.values())
        best = counts.most_common(1)
        if best and best[0][1] >= needed:
            return _winner_result(lobby, best[0][0], "region_domination")
        return None

    if wc_type == "points":
        threshold = _points_win_threshold(win_condition, provinces, teams, difficulty_by_slug)
        if threshold is None or threshold <= 0:
            return _full_capture_leader(lobby, provinces, teams, difficulty_by_slug)
        scores = compute_team_scores(provinces, teams, difficulty_by_slug or {})
        qualified = [
            (team, score.total_points)
            for team, score in scores.items()
            if score.total_points >= threshold
        ]
        if not qualified:
            return _full_capture_leader(lobby, provinces, teams, difficulty_by_slug)
        team = max(qualified, key=lambda item: (item[1], -item[0]))[0]
        return _winner_result(lobby, team, "total_points")

    # territory_control (default): own at least `threshold` of all provinces.
    try:
        threshold = float(win_condition.get("threshold") or 0.5)
    except (TypeError, ValueError):
        threshold = 0.5
    counts = Counter(teams[p.captured_by] for p in provinces if p.captured_by in teams)
    best = counts.most_common(1)
    if best and best[0][1] / total >= threshold:
        return _winner_result(lobby, best[0][0], "territory_control")

    # Deadlock guard: if the whole map is captured but no win condition fired,
    # the game has nowhere to go — crown the current leader.
    return _full_capture_leader(lobby, provinces, teams, difficulty_by_slug)


def _winner_result(lobby: Lobby, team: int, reason: str) -> WinnerResult:
    if lobby.faction_mode:
        return WinnerResult(winner_user_id=None, winner_faction_id=team, reason=reason)
    return WinnerResult(winner_user_id=team, winner_faction_id=None, reason=reason)


register(TerritoryMode())
