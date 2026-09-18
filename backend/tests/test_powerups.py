"""Tests for lobby power-ups: inventory, region grants, and the three effects."""

from datetime import datetime, timedelta, timezone

from app.models.lobby_map_province import LobbyMapProvince
from app.models.lobby_player import LobbyPlayer
from app.models.leetcode_problem import LeetCodeProblem
from app.models.user_solved import UserSolved
from app.services.capture_engine import CAPTURE, RECAPTURE, apply_capture_pass
from app.services.powerups import (
    MAX_POWERUPS_HELD,
    consume_powerup,
    fortify_province,
    grant_powerup,
    grant_region_powerup,
    has_powerup,
    is_fortified,
    powerup_counts,
    reroll_province,
    siege_province,
)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _lp(db, user_id=1, lobby_id=1) -> LobbyPlayer:
    player = LobbyPlayer(lobby_id=lobby_id, user_id=user_id)
    db.add(player)
    db.commit()
    return player


def _province(db, *, slug="two-sum", captured_by=None, captured_runtime_ms=None) -> LobbyMapProvince:
    province = LobbyMapProvince(
        lobby_map_id=1,
        province_id="p1",
        region_id="arrays",
        topic_id="arrays",
        problem_title_slug=slug,
        captured_by=captured_by,
        captured_runtime_ms=captured_runtime_ms,
    )
    db.add(province)
    db.commit()
    return province


# ── Inventory ──


def test_grant_and_cap(db):
    player = _lp(db)
    for _ in range(MAX_POWERUPS_HELD):
        assert grant_powerup(player, "reroll")
    # Cap: no more can be held.
    assert not grant_powerup(player, "fortify")
    assert sum(powerup_counts(player).values()) == MAX_POWERUPS_HELD
    assert has_powerup(player, "reroll")
    assert consume_powerup(player, "reroll")
    assert not consume_powerup(player, "fortify")


def test_grant_region_once_per_region(db):
    player = _lp(db)
    assert grant_region_powerup(player, "north")
    # Same region only grants once.
    assert not grant_region_powerup(player, "north")
    assert player.granted_regions == ["north"]


def test_grant_region_respects_cap(db):
    player = _lp(db)
    for _ in range(MAX_POWERUPS_HELD):
        grant_powerup(player, "siege")
    assert not grant_region_powerup(player, "south")


# ── Fortify ──


def test_fortify_and_is_fortified(db):
    province = _province(db, captured_by=1)
    fortify_province(province)
    assert is_fortified(province)
    province.fortified_until = _now() - timedelta(hours=1)
    assert not is_fortified(province)


# ── Reroll ──


def test_reroll_keeps_difficulty(db):
    db.add_all([
        LeetCodeProblem(title_slug="a", title="A", difficulty="Easy", frontend_id=1, topic_tags=[]),
        LeetCodeProblem(title_slug="b", title="B", difficulty="Easy", frontend_id=2, topic_tags=[]),
        LeetCodeProblem(title_slug="c", title="C", difficulty="Hard", frontend_id=3, topic_tags=[]),
    ])
    db.commit()
    province = _province(db, slug="a")
    new_problem = reroll_province(province, 1, db)
    assert new_problem is not None
    assert new_problem.difficulty == "Easy"
    assert province.problem_title_slug in {"a", "b"}


# ── Siege ──


def test_siege_lowers_difficulty(db):
    db.add_all([
        LeetCodeProblem(title_slug="h", title="H", difficulty="Hard", frontend_id=1, topic_tags=[]),
        LeetCodeProblem(title_slug="m", title="M", difficulty="Medium", frontend_id=2, topic_tags=[]),
    ])
    db.commit()
    province = _province(db, slug="h")
    new_problem = siege_province(province, 1, db)
    assert new_problem is not None
    assert new_problem.difficulty == "Medium"


# ── Capture engine blocks fortified provinces ──


def test_capture_pass_blocks_recapture_on_fortified(db):
    province = _province(db, slug="a", captured_by=2, captured_runtime_ms=1500)

    row = UserSolved(
        user_id=1,
        title_slug="a",
        language="python3",
        solved_at=_now(),
        best_runtime_ms=900,
        best_runtime_at=_now(),
    )
    db.add(row)
    db.commit()

    solved_by_user = {1: {"a": row}}
    changes = apply_capture_pass(
        provinces=[province],
        solved_by_user=solved_by_user,
        username_by_id={1: "alice"},
        since=_now() - timedelta(minutes=5),
        tiebreak_order=[1, 2],
        blocked_recapture_ids={"p1"},
    )
    assert changes == []
    assert province.captured_by == 2

    changes = apply_capture_pass(
        provinces=[province],
        solved_by_user=solved_by_user,
        username_by_id={1: "alice"},
        since=_now() - timedelta(minutes=5),
        tiebreak_order=[1, 2],
    )
    assert any(change.kind == RECAPTURE for change in changes)
    assert province.captured_by == 1
