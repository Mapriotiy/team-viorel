"""Lobby power-ups: reroll, fortify, siege.

Rules:
- Each player holds up to MAX_POWERUPS_HELD (2) power-ups per lobby.
- Completing a region (owning every province in it) grants one random
  power-up, once per region.
- reroll: replace an unowned province's problem with another of the same
  difficulty (topic may change).
- fortify: shield your own province from recapture (permanent by default,
  configurable via fortify_duration_hours).
- siege: on an unowned province, replace the problem with an easier one of
  the same region topic (one difficulty step down); the province stays a
  cheap, beatable-by-any-solve target.
"""

import logging
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby_map_province import LobbyMapProvince
from app.models.lobby_player import LobbyPlayer
from app.core.config import settings
from app.services.map_config import REGION_TOPICS
from app.services.problem_catalog import get_problems_by_tags
from app.services.user_solved import get_solved_slugs_with_timestamps

logger = logging.getLogger(__name__)

POWERUP_TYPES = ("reroll", "fortify", "siege")
MAX_POWERUPS_HELD = 2

# Sentinel so a permanent shield still passes the is_fortified future check.
_FORTIFY_FOREVER = datetime(9999, 12, 31, 23, 59, 59)

_DIFFICULTY_RANK = {"Hard": 2, "Medium": 1, "Easy": 0}
_LOWER_DIFFICULTY = {"Hard": "Medium", "Medium": "Easy", "Easy": "Easy"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def powerup_counts(lp: LobbyPlayer) -> dict[str, int]:
    counts = {name: 0 for name in POWERUP_TYPES}
    if lp.powerups and isinstance(lp.powerups, dict):
        for name in POWERUP_TYPES:
            try:
                counts[name] = max(0, int(lp.powerups.get(name) or 0))
            except (TypeError, ValueError):
                counts[name] = 0
    return counts


def _save_counts(lp: LobbyPlayer, counts: dict[str, int]) -> None:
    lp.powerups = {name: counts.get(name, 0) for name in POWERUP_TYPES}


def _held_count(lp: LobbyPlayer) -> int:
    return sum(powerup_counts(lp).values())


def grant_powerup(lp: LobbyPlayer, powerup_type: str) -> bool:
    if powerup_type not in POWERUP_TYPES:
        return False
    if _held_count(lp) >= MAX_POWERUPS_HELD:
        return False
    counts = powerup_counts(lp)
    counts[powerup_type] += 1
    _save_counts(lp, counts)
    return True


def consume_powerup(lp: LobbyPlayer, powerup_type: str) -> bool:
    counts = powerup_counts(lp)
    if counts.get(powerup_type, 0) <= 0:
        return False
    counts[powerup_type] -= 1
    _save_counts(lp, counts)
    return True


def has_powerup(lp: LobbyPlayer, powerup_type: str) -> bool:
    return powerup_counts(lp).get(powerup_type, 0) > 0


def grant_region_powerup(lp: LobbyPlayer, region_id: str) -> bool:
    """Grant one random power-up for completing a region (once per region)."""
    if _held_count(lp) >= MAX_POWERUPS_HELD:
        return False
    granted = set(lp.granted_regions or [])
    if region_id in granted:
        return False
    counts = powerup_counts(lp)
    counts[random.choice(POWERUP_TYPES)] += 1
    _save_counts(lp, counts)
    granted.add(region_id)
    lp.granted_regions = sorted(granted)
    return True


def is_fortified(province: LobbyMapProvince) -> bool:
    if province.fortified_until is None:
        return False
    return _naive_utc(province.fortified_until) > _naive_utc(_utcnow())


def fortify_province(province: LobbyMapProvince) -> None:
    hours = settings.fortify_duration_hours
    if hours is None or hours <= 0:
        province.fortified_until = _FORTIFY_FOREVER
    else:
        province.fortified_until = _naive_utc(_utcnow()) + timedelta(hours=hours)


def _solved_slugs(user_id: int, db: Session) -> set[str]:
    return set(get_solved_slugs_with_timestamps(user_id, db).keys())


def _load_problem(slug: str, db: Session) -> LeetCodeProblem | None:
    return db.query(LeetCodeProblem).filter_by(title_slug=slug).first()


def _pick_problem(db: Session, tags: list[str], difficulty: str, exclude: set[str]) -> LeetCodeProblem | None:
    candidates = get_problems_by_tags(tags, difficulty, exclude, db)
    if not candidates:
        candidates = get_problems_by_tags([], difficulty, exclude, db)
    return random.choice(candidates) if candidates else None


def _topic_tags(province: LobbyMapProvince) -> list[str]:
    cfg = REGION_TOPICS.get(province.topic_id or "") or REGION_TOPICS.get(province.region_id)
    if not cfg:
        return []
    return list(cfg.get("tags") or [])


def reroll_province(province: LobbyMapProvince, acting_user_id: int, db: Session) -> LeetCodeProblem | None:
    current = _load_problem(province.problem_title_slug, db)
    difficulty = current.difficulty if current else "Easy"
    exclude = {province.problem_title_slug} | _solved_slugs(acting_user_id, db)
    prob = _pick_problem(db, _topic_tags(province), difficulty, exclude)
    if prob is None:
        prob = _pick_problem(db, [], difficulty, exclude)
    if prob is None:
        return None
    province.problem_title_slug = prob.title_slug
    return prob


def siege_province(province: LobbyMapProvince, acting_user_id: int, db: Session) -> LeetCodeProblem | None:
    current = _load_problem(province.problem_title_slug, db)
    difficulty = current.difficulty if current else "Easy"
    target_difficulty = _LOWER_DIFFICULTY.get(difficulty, "Easy")
    exclude = {province.problem_title_slug} | _solved_slugs(acting_user_id, db)
    prob = _pick_problem(db, _topic_tags(province), target_difficulty, exclude)
    if prob is None:
        prob = _pick_problem(db, [], target_difficulty, exclude)
    if prob is None:
        return None
    province.problem_title_slug = prob.title_slug
    return prob
