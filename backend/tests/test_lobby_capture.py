"""Lobby capture parity: the shared engine on LobbyMapProvince rows, and
team score math."""

from datetime import datetime

from app.models.lobby_map_province import LobbyMapProvince
from app.models.user_solved import UserSolved
from app.services.capture_engine import (
    CAPTURE,
    DEFENSE,
    RECAPTURE,
    REGION_CONTROL,
    REGION_CONTROL_LOST,
    apply_capture_pass,
)
from app.services.events import region_control_changes
from app.services.scoring import TeamScore, compute_team_scores, region_control_by_team

SINCE = datetime(2026, 7, 27)
ALICE, BOB, CAROL, DAVE = 1, 2, 3, 4
USERNAMES = {ALICE: "alice", BOB: "bob", CAROL: "carol", DAVE: "dave"}


def make_province(
    slug: str,
    province_id: str = "path34",
    region_id: str = "isle1",
    captured_by=None,
    captured_runtime_ms=None,
    first_captured_by=None,
) -> LobbyMapProvince:
    return LobbyMapProvince(
        lobby_map_id=1,
        province_id=province_id,
        region_id=region_id,
        problem_title_slug=slug,
        captured_by=captured_by,
        captured_runtime_ms=captured_runtime_ms,
        first_captured_by=first_captured_by,
    )


def make_solve(user_id: int, slug: str, minute: int = 0, runtime_ms=None) -> UserSolved:
    solved_at = datetime(2026, 7, 27, 12, minute)
    return UserSolved(
        user_id=user_id,
        title_slug=slug,
        solved_at=solved_at,
        best_runtime_ms=runtime_ms,
        best_runtime_at=solved_at if runtime_ms is not None else None,
    )


def run_pass(provinces, solves, team_by_user=None):
    solved_by_user: dict[int, dict[str, UserSolved]] = {}
    for solve in solves:
        solved_by_user.setdefault(solve.user_id, {})[solve.title_slug] = solve
    return apply_capture_pass(
        provinces=provinces,
        solved_by_user=solved_by_user,
        username_by_id=USERNAMES,
        since=SINCE,
        tiebreak_order=[ALICE, BOB, CAROL, DAVE],
        team_by_user=team_by_user,
    )


def test_lobby_province_supports_full_capture_cycle():
    province = make_province("two-sum")

    changes = run_pass([province], [make_solve(ALICE, "two-sum", minute=0, runtime_ms=200)])
    assert [c.kind for c in changes] == [CAPTURE]
    assert province.captured_by == ALICE
    assert province.first_captured_by == ALICE
    assert province.captured_runtime_ms == 200

    changes = run_pass([province], [make_solve(ALICE, "two-sum", runtime_ms=150)])
    assert [c.kind for c in changes] == [DEFENSE]
    assert province.captured_runtime_ms == 150

    changes = run_pass([province], [make_solve(BOB, "two-sum", runtime_ms=100)])
    assert [c.kind for c in changes] == [RECAPTURE]
    assert province.captured_by == BOB
    assert province.first_captured_by == ALICE


def test_legacy_lobby_capture_without_runtime_is_stealable():
    # Pre-parity lobby captures have a NULL runtime bar.
    province = make_province("two-sum", captured_by=ALICE, first_captured_by=ALICE)
    changes = run_pass([province], [make_solve(BOB, "two-sum", runtime_ms=5000)])

    assert [c.kind for c in changes] == [RECAPTURE]
    assert province.captured_by == BOB


def test_multi_province_pass_with_four_players():
    p1 = make_province("two-sum", province_id="path34")
    p2 = make_province("add-two-numbers", province_id="path36")
    changes = run_pass(
        [p1, p2],
        [
            make_solve(ALICE, "two-sum", minute=0, runtime_ms=100),
            make_solve(BOB, "two-sum", minute=1, runtime_ms=50),
            make_solve(CAROL, "add-two-numbers", minute=2, runtime_ms=80),
            make_solve(DAVE, "add-two-numbers", minute=1, runtime_ms=90),
        ],
    )

    # Initial captures go to the earliest solver of each province; a faster
    # later solve only matters on the next pass.
    kinds = {(c.province.province_id, c.kind) for c in changes}
    assert kinds == {("path34", CAPTURE), ("path36", CAPTURE)}
    assert p1.captured_by == ALICE
    assert p2.captured_by == DAVE

    # Next pass: Bob's faster runtime steals two-sum from Alice.
    changes = run_pass([p1, p2], [make_solve(BOB, "two-sum", minute=1, runtime_ms=50)])
    assert [c.kind for c in changes] == [RECAPTURE]
    assert p1.captured_by == BOB
    assert p1.first_captured_by == ALICE


def test_faction_capture_pass():
    province = make_province("two-sum", captured_by=ALICE, captured_runtime_ms=200,
                             first_captured_by=ALICE)
    teams = {ALICE: 1, BOB: 1, CAROL: 2, DAVE: 2}
    changes = run_pass(
        [province],
        [
            make_solve(BOB, "two-sum", runtime_ms=120),
            make_solve(CAROL, "two-sum", runtime_ms=150),
        ],
        team_by_user=teams,
    )

    # Bob's friendly takeover raises the bar to 120, blocking Carol's 150.
    assert [c.kind for c in changes] == [DEFENSE]
    assert province.captured_by == BOB


# ── Team score math ──


def test_compute_team_scores_free_for_all():
    provinces = [
        make_province("easy-1", captured_by=ALICE, first_captured_by=ALICE),
        make_province("hard-1", captured_by=BOB, first_captured_by=ALICE),
        make_province("medium-1"),
    ]
    difficulties = {"easy-1": "Easy", "hard-1": "Hard", "medium-1": "Medium"}
    scores = compute_team_scores(
        provinces, {ALICE: ALICE, BOB: BOB}, difficulties,
    )

    # Alice: owns easy-1 (100) + first-capture bonuses for both (50 + 250).
    assert scores[ALICE].provinces == 1
    assert scores[ALICE].base_points == 100
    assert scores[ALICE].bonus_points == 300
    assert scores[ALICE].total_points == 400

    # Bob: owns hard-1 (500), no bonuses.
    assert scores[BOB].provinces == 1
    assert scores[BOB].base_points == 500
    assert scores[BOB].bonus_points == 0


def test_compute_team_scores_factions_pool_points():
    provinces = [
        make_province("easy-1", captured_by=ALICE, first_captured_by=ALICE),
        make_province("easy-2", captured_by=BOB, first_captured_by=BOB),
        make_province("easy-3", captured_by=CAROL, first_captured_by=CAROL),
    ]
    difficulties = {"easy-1": "Easy", "easy-2": "Easy", "easy-3": "Easy"}
    teams = {ALICE: 1, BOB: 1, CAROL: 2}
    scores = compute_team_scores(provinces, teams, difficulties)

    assert scores[1].provinces == 2
    assert scores[1].base_points == 200
    assert scores[1].bonus_points == 100
    assert scores[2].total_points == 150


def test_compute_team_scores_ignores_unknown_users():
    # A player who left the lobby contributes nothing.
    provinces = [make_province("easy-1", captured_by=DAVE, first_captured_by=DAVE)]
    scores = compute_team_scores(provinces, {ALICE: ALICE}, {"easy-1": "Easy"})

    assert scores.get(ALICE, TeamScore()).total_points == 0
    assert DAVE not in scores


# ── Region-control events ──


def _region_pair(captured_by=None):
    return [
        make_province("p-1", province_id="path44", region_id="isle2",
                      captured_by=captured_by, captured_runtime_ms=100 if captured_by else None),
        make_province("p-2", province_id="path48", region_id="isle2",
                      captured_by=captured_by, captured_runtime_ms=100 if captured_by else None),
    ]


def test_completing_a_region_emits_region_control_once():
    provinces = _region_pair()
    provinces[0].captured_by = ALICE
    provinces[0].captured_runtime_ms = 100
    teams = {ALICE: ALICE, BOB: BOB}

    before = region_control_by_team(provinces, teams)
    changes = run_pass(provinces, [make_solve(ALICE, "p-2", runtime_ms=100)])
    after = region_control_by_team(provinces, teams)

    events = region_control_changes(provinces, changes, before, after)
    assert [e.kind for e in events] == [REGION_CONTROL]
    assert events[0].actor_user_id == ALICE
    assert events[0].points == 200  # 50 * 2^2
    assert events[0].province.region_id == "isle2"


def test_breaking_control_emits_region_control_lost_once():
    provinces = _region_pair(captured_by=ALICE)
    teams = {ALICE: ALICE, BOB: BOB}

    before = region_control_by_team(provinces, teams)
    assert before == {"isle2": ALICE}
    changes = run_pass(provinces, [make_solve(BOB, "p-2", runtime_ms=50)])
    after = region_control_by_team(provinces, teams)

    events = region_control_changes(provinces, changes, before, after)
    assert [e.kind for e in events] == [REGION_CONTROL_LOST]
    assert events[0].actor_user_id == BOB
    assert events[0].previous_owner_user_id == ALICE
    assert events[0].points == 200


def test_stealing_a_whole_region_emits_lost_then_control():
    provinces = _region_pair(captured_by=ALICE)
    teams = {ALICE: ALICE, BOB: BOB}

    before = region_control_by_team(provinces, teams)
    changes = run_pass(
        provinces,
        [make_solve(BOB, "p-1", runtime_ms=50), make_solve(BOB, "p-2", runtime_ms=50)],
    )
    after = region_control_by_team(provinces, teams)

    events = region_control_changes(provinces, changes, before, after)
    assert [e.kind for e in events] == [REGION_CONTROL_LOST, REGION_CONTROL]
    assert events[1].actor_user_id == BOB


def test_no_control_change_emits_nothing():
    provinces = _region_pair(captured_by=ALICE)
    teams = {ALICE: ALICE, BOB: BOB}

    before = region_control_by_team(provinces, teams)
    # Defense only: Alice improves her own runtime, control unchanged.
    changes = run_pass(provinces, [make_solve(ALICE, "p-1", runtime_ms=40)])
    after = region_control_by_team(provinces, teams)

    assert region_control_changes(provinces, changes, before, after) == []
