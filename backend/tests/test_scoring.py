from app.models.weekly_map_province import WeeklyMapProvince
from app.services.scoring import (
    compute_score,
    compute_team_scores,
    first_capture_bonus,
    flag_points,
    region_control_bonus,
    region_control_by_team,
)


def province(slug: str, region: str, captured_by=None, first_captured_by=None):
    return WeeklyMapProvince(
        weekly_map_id=1,
        province_id=slug,
        region_id=region,
        problem_title_slug=slug,
        captured_by=captured_by,
        first_captured_by=first_captured_by,
    )


def test_flag_points_by_difficulty():
    assert flag_points("Easy") == 100
    assert flag_points("Medium") == 250
    assert flag_points("Hard") == 500
    assert flag_points(None) == 100
    assert flag_points("Unknown") == 100


def test_first_capture_bonus_is_half_flag_value():
    assert first_capture_bonus("Easy") == 50
    assert first_capture_bonus("Medium") == 125
    assert first_capture_bonus("Hard") == 250


def test_owner_earns_flag_points_plus_bonus():
    provinces = [
        province("a", "r1", captured_by=1, first_captured_by=1),
        province("b", "r1", captured_by=2, first_captured_by=2),
        province("c", "r2"),
    ]
    difficulties = {"a": "Hard", "b": "Easy", "c": "Medium"}

    score = compute_score(provinces, 1, 2, difficulties)

    assert score.player_base_points == 500
    assert score.player_bonus_points == 250
    assert score.player_points == 750
    assert score.friend_points == 150


def test_recaptured_province_leaves_bonus_with_first_captor():
    # Player 2 stole the province, but player 1 first-captured it.
    provinces = [province("a", "r1", captured_by=2, first_captured_by=1)]
    difficulties = {"a": "Medium"}

    score = compute_score(provinces, 1, 2, difficulties)

    assert score.player_base_points == 0
    assert score.player_bonus_points == 125
    assert score.player_points == 125
    assert score.friend_base_points == 250
    assert score.friend_bonus_points == 0
    assert score.friend_points == 250


def test_counts_and_regions_unchanged():
    provinces = [
        province("a", "r1", captured_by=1, first_captured_by=1),
        province("b", "r1", captured_by=1, first_captured_by=1),
        province("c", "r2", captured_by=2, first_captured_by=2),
        province("d", "r2"),
    ]
    score = compute_score(provinces, 1, 2, {})

    assert score.player_provinces == 2
    assert score.friend_provinces == 1
    assert score.neutral_provinces == 1
    assert score.player_regions == 1
    assert score.friend_regions == 1


def test_weekly_score_has_no_region_control_bonus():
    # Player 1 fully owns r1, but the dormant weekly mode predates the bonus.
    provinces = [
        province("a", "r1", captured_by=1, first_captured_by=1),
        province("b", "r1", captured_by=1, first_captured_by=1),
    ]
    score = compute_score(provinces, 1, 2, {"a": "Easy", "b": "Easy"})

    assert score.player_points == 300  # 2 flags + 2 bonuses, nothing else


# ── Region control ──


def test_region_control_bonus_scales_quadratically():
    assert region_control_bonus(1) == 50
    assert region_control_bonus(2) == 200
    assert region_control_bonus(3) == 450
    assert region_control_bonus(4) == 800
    assert region_control_bonus(5) == 1250
    assert region_control_bonus(7) == 2450


def test_region_control_requires_every_province():
    provinces = [
        province("a", "r1", captured_by=1),
        province("b", "r1", captured_by=1),
        province("c", "r2", captured_by=1),
        province("d", "r2"),  # neutral blocks control of r2
        province("e", "r3", captured_by=1),
        province("f", "r3", captured_by=2),  # contested r3
    ]
    control = region_control_by_team(provinces, {1: 1, 2: 2})

    assert control == {"r1": 1}


def test_region_control_by_faction_pools_members():
    provinces = [
        province("a", "r1", captured_by=1),
        province("b", "r1", captured_by=2),
    ]
    # Users 1 and 2 share faction 7: the faction controls r1.
    assert region_control_by_team(provinces, {1: 7, 2: 7}) == {"r1": 7}
    # As separate teams nobody does.
    assert region_control_by_team(provinces, {1: 1, 2: 2}) == {}


def test_team_scores_include_held_region_control():
    provinces = [
        province("a", "r1", captured_by=1, first_captured_by=1),
        province("b", "r1", captured_by=1, first_captured_by=1),
        province("c", "r1", captured_by=1, first_captured_by=1),
    ]
    difficulties = {"a": "Easy", "b": "Easy", "c": "Easy"}
    scores = compute_team_scores(provinces, {1: 1, 2: 2}, difficulties)

    assert scores[1].region_control_points == 450  # 50 * 3^2
    assert scores[1].total_points == 300 + 150 + 450


def test_region_control_bonus_disappears_when_a_province_flips():
    provinces = [
        province("a", "r1", captured_by=1, first_captured_by=1),
        province("b", "r1", captured_by=1, first_captured_by=1),
    ]
    teams = {1: 1, 2: 2}
    assert compute_team_scores(provinces, teams, {})[1].region_control_points == 200

    provinces[1].captured_by = 2  # steal one province
    scores = compute_team_scores(provinces, teams, {})
    assert scores[1].region_control_points == 0
    assert scores[2].region_control_points == 0  # contested, nobody holds it
