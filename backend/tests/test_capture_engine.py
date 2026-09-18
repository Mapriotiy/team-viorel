from datetime import datetime, timezone

from app.models.user_solved import UserSolved
from app.models.weekly_map_province import WeeklyMapProvince
from app.services.capture_engine import (
    CAPTURE,
    DEFENSE,
    RECAPTURE,
    apply_capture_pass,
)

SINCE = datetime(2026, 7, 27)  # a Monday
USER_A = 1
USER_B = 2
USER_C = 3

USERNAMES = {USER_A: "alice", USER_B: "bob", USER_C: "carol"}


def make_province(
    slug: str = "two-sum",
    captured_by=None,
    captured_runtime_ms=None,
    first_captured_by=None,
) -> WeeklyMapProvince:
    return WeeklyMapProvince(
        weekly_map_id=1,
        province_id="path34",
        region_id="isle1",
        problem_title_slug=slug,
        captured_by=captured_by,
        captured_runtime_ms=captured_runtime_ms,
        first_captured_by=first_captured_by,
        captured_at=datetime(2026, 7, 27, 8, 0) if captured_by else None,
        first_captured_at=datetime(2026, 7, 27, 8, 0) if first_captured_by else None,
    )


def make_solve(
    user_id: int,
    slug: str = "two-sum",
    solved_at: datetime = datetime(2026, 7, 27, 12, 0),
    runtime_ms=None,
) -> UserSolved:
    return UserSolved(
        user_id=user_id,
        title_slug=slug,
        solved_at=solved_at,
        best_runtime_ms=runtime_ms,
        best_submission_url=f"https://leetcode.com/submissions/detail/{user_id}00/",
        best_runtime_at=solved_at if runtime_ms is not None else None,
    )


def run_pass(province, *solves, since=SINCE, team_by_user=None):
    solved_by_user: dict[int, dict[str, UserSolved]] = {}
    for solve in solves:
        if solve is None:
            continue
        solved_by_user.setdefault(solve.user_id, {})[solve.title_slug] = solve
    return apply_capture_pass(
        provinces=[province],
        solved_by_user=solved_by_user,
        username_by_id=USERNAMES,
        since=since,
        tiebreak_order=[USER_A, USER_B, USER_C],
        team_by_user=team_by_user,
    )


def test_sole_solver_captures():
    province = make_province()
    changes = run_pass(province, make_solve(USER_A, runtime_ms=120))

    assert [c.kind for c in changes] == [CAPTURE]
    assert province.captured_by == USER_A
    assert province.first_captured_by == USER_A
    assert province.captured_runtime_ms == 120
    assert province.capturer_leetcode_username == "alice"


def test_earliest_solver_wins_initial_capture():
    province = make_province()
    changes = run_pass(
        province,
        make_solve(USER_A, solved_at=datetime(2026, 7, 27, 13, 0)),
        make_solve(USER_B, solved_at=datetime(2026, 7, 27, 12, 0)),
    )

    assert [c.kind for c in changes] == [CAPTURE]
    assert province.captured_by == USER_B


def test_timestamp_tie_goes_to_first_in_tiebreak_order():
    province = make_province()
    ts = datetime(2026, 7, 27, 12, 0)
    run_pass(
        province,
        make_solve(USER_A, solved_at=ts),
        make_solve(USER_B, solved_at=ts),
    )

    assert province.captured_by == USER_A


def test_strictly_faster_challenger_steals():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=167, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_B, runtime_ms=120))

    assert [c.kind for c in changes] == [RECAPTURE]
    change = changes[0]
    assert change.actor_user_id == USER_B
    assert change.previous_owner_user_id == USER_A
    assert change.runtime_ms == 120
    assert change.previous_runtime_ms == 167
    assert province.captured_by == USER_B
    assert province.captured_runtime_ms == 120
    assert province.capturer_leetcode_username == "bob"


def test_equal_runtime_keeps_incumbent():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=120, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_B, runtime_ms=120))

    assert changes == []
    assert province.captured_by == USER_A


def test_challenger_without_runtime_cannot_steal():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=500, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_B, runtime_ms=None))

    assert changes == []
    assert province.captured_by == USER_A


def test_incumbent_without_runtime_is_beatable_by_any_timed_solve():
    # Pre-parity captures have no stored runtime.
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=None, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_B, runtime_ms=9999))

    assert [c.kind for c in changes] == [RECAPTURE]
    assert changes[0].previous_runtime_ms is None
    assert province.captured_by == USER_B


def test_zero_runtime_steals_from_one_ms():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=1, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_B, runtime_ms=0))

    assert [c.kind for c in changes] == [RECAPTURE]
    assert province.captured_runtime_ms == 0


def test_owner_defends_by_improving_runtime():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=167, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_A, runtime_ms=98))

    assert [c.kind for c in changes] == [DEFENSE]
    assert changes[0].runtime_ms == 98
    assert changes[0].previous_runtime_ms == 167
    assert changes[0].previous_owner_user_id is None
    assert province.captured_by == USER_A
    assert province.captured_runtime_ms == 98


def test_defense_in_same_pass_blocks_steal():
    # Owner improves to 90 while the challenger posts 100: the defense
    # runs first, so the steal against the old 150 bar fails.
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=150, first_captured_by=USER_A,
    )
    changes = run_pass(
        province,
        make_solve(USER_A, runtime_ms=90),
        make_solve(USER_B, runtime_ms=100),
    )

    assert [c.kind for c in changes] == [DEFENSE]
    assert province.captured_by == USER_A
    assert province.captured_runtime_ms == 90


def test_slower_resolve_is_no_defense_and_no_change():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=90, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_A, runtime_ms=200))

    assert changes == []
    assert province.captured_runtime_ms == 90


def test_pre_cutoff_solve_cannot_capture():
    province = make_province()
    changes = run_pass(
        province,
        make_solve(USER_A, solved_at=datetime(2026, 7, 20, 12, 0)),
    )

    assert changes == []
    assert province.captured_by is None


def test_pre_cutoff_solve_cannot_steal():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=500, first_captured_by=USER_A,
    )
    changes = run_pass(
        province,
        make_solve(USER_B, solved_at=datetime(2026, 7, 20, 12, 0), runtime_ms=1),
    )

    assert changes == []
    assert province.captured_by == USER_A


def test_recapture_never_moves_first_capture_ledger():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=167, first_captured_by=USER_A,
    )
    run_pass(province, make_solve(USER_B, runtime_ms=120))

    assert province.captured_by == USER_B
    assert province.first_captured_by == USER_A


def test_steal_back_with_faster_runtime():
    province = make_province(
        captured_by=USER_B, captured_runtime_ms=120, first_captured_by=USER_A,
    )
    changes = run_pass(province, make_solve(USER_A, runtime_ms=95))

    assert [c.kind for c in changes] == [RECAPTURE]
    assert province.captured_by == USER_A
    assert province.first_captured_by == USER_A


# ── N-player and faction behavior ──


def test_three_player_earliest_capture():
    province = make_province()
    run_pass(
        province,
        make_solve(USER_A, solved_at=datetime(2026, 7, 27, 14, 0)),
        make_solve(USER_B, solved_at=datetime(2026, 7, 27, 12, 0)),
        make_solve(USER_C, solved_at=datetime(2026, 7, 27, 13, 0)),
    )

    assert province.captured_by == USER_B


def test_fastest_of_multiple_challengers_wins_recapture():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=200, first_captured_by=USER_A,
    )
    changes = run_pass(
        province,
        make_solve(USER_B, runtime_ms=150),
        make_solve(USER_C, runtime_ms=100),
    )

    assert [c.kind for c in changes] == [RECAPTURE]
    assert province.captured_by == USER_C
    assert province.captured_runtime_ms == 100


def test_same_team_solver_cannot_steal():
    # B is on A's faction: even with a bar-beating runtime there is no
    # RECAPTURE, only a friendly takeover logged as DEFENSE.
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=200, first_captured_by=USER_A,
    )
    teams = {USER_A: 1, USER_B: 1, USER_C: 2}
    changes = run_pass(province, make_solve(USER_B, runtime_ms=100), team_by_user=teams)

    assert [c.kind for c in changes] == [DEFENSE]
    assert province.captured_by == USER_B


def test_faster_teammate_takes_over_and_raises_bar():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=200, first_captured_by=USER_A,
    )
    teams = {USER_A: 1, USER_B: 1, USER_C: 2}
    changes = run_pass(
        province,
        make_solve(USER_B, runtime_ms=100),
        make_solve(USER_C, runtime_ms=150),
        team_by_user=teams,
    )

    # Teammate takeover raises the bar to 100, which blocks C's 150 steal.
    assert [c.kind for c in changes] == [DEFENSE]
    change = changes[0]
    assert change.actor_user_id == USER_B
    assert change.previous_owner_user_id == USER_A
    assert province.captured_by == USER_B
    assert province.captured_runtime_ms == 100
    assert province.first_captured_by == USER_A


def test_teammate_takeover_keeps_first_capture_ledger():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=200, first_captured_by=USER_A,
    )
    teams = {USER_A: 1, USER_B: 1}
    run_pass(province, make_solve(USER_B, runtime_ms=100), team_by_user=teams)

    assert province.first_captured_by == USER_A


def test_enemy_faction_steals_from_faction_owner():
    province = make_province(
        captured_by=USER_A, captured_runtime_ms=200, first_captured_by=USER_A,
    )
    teams = {USER_A: 1, USER_B: 1, USER_C: 2}
    changes = run_pass(province, make_solve(USER_C, runtime_ms=100), team_by_user=teams)

    assert [c.kind for c in changes] == [RECAPTURE]
    assert province.captured_by == USER_C


def test_aware_since_cutoff_is_normalized_to_naive_utc():
    # lobby.started_at is tz-aware before a DB refresh, while UserSolved
    # timestamps are naive UTC; the engine must compare them safely.
    province = make_province()
    aware_since = datetime(2026, 7, 27, tzinfo=timezone.utc)
    changes = run_pass(
        province,
        make_solve(USER_A, solved_at=datetime(2026, 7, 27, 12, 0)),
        since=aware_since,
    )

    assert [c.kind for c in changes] == [CAPTURE]
    assert province.captured_by == USER_A


def test_aware_since_cutoff_excludes_earlier_naive_solves():
    province = make_province()
    aware_since = datetime(2026, 7, 27, 10, 0, tzinfo=timezone.utc)
    changes = run_pass(
        province,
        make_solve(USER_A, solved_at=datetime(2026, 7, 27, 9, 0)),
        since=aware_since,
    )

    assert changes == []
    assert province.captured_by is None
