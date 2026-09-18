"""Score computation over capturable provinces.

Score is a pure function of province rows: the current owner's team earns
each province's flag value, the team of whoever first captured it keeps a
permanent first-capture bonus regardless of later recaptures, and a team
currently owning every province of a region holds that region's control
bonus for as long as its control lasts.
"""

from collections import Counter
from dataclasses import dataclass
from typing import Sequence

from app.models.weekly_map_province import WeeklyMapProvince
from app.schemas.maps import ScoreResponse

FLAG_POINTS: dict[str, int] = {
    "Easy": 100,
    "Medium": 250,
    "Hard": 500,
}

DEFAULT_FLAG_POINTS = 100

REGION_CONTROL_POINTS_PER_PROVINCE_SQUARED = 50


def flag_points(difficulty: str | None) -> int:
    if difficulty is None:
        return DEFAULT_FLAG_POINTS
    return FLAG_POINTS.get(difficulty, DEFAULT_FLAG_POINTS)


def first_capture_bonus(difficulty: str | None) -> int:
    return flag_points(difficulty) // 2


def region_control_bonus(province_count: int) -> int:
    """Bonus for holding a whole region; scales quadratically with its size."""
    return REGION_CONTROL_POINTS_PER_PROVINCE_SQUARED * province_count**2


def region_control_by_team(
    provinces: Sequence,
    team_by_user: dict[int, int],
) -> dict[str, int]:
    """region_id -> team currently owning ALL of that region's provinces."""
    teams_by_region: dict[str, set[int | None]] = {}
    for p in provinces:
        team = (
            team_by_user.get(p.captured_by)
            if p.captured_by is not None
            else None
        )
        teams_by_region.setdefault(p.region_id, set()).add(team)

    return {
        region_id: next(iter(teams))
        for region_id, teams in teams_by_region.items()
        if len(teams) == 1 and None not in teams
    }


@dataclass
class TeamScore:
    provinces: int = 0
    base_points: int = 0
    bonus_points: int = 0
    region_control_points: int = 0

    @property
    def total_points(self) -> int:
        return self.base_points + self.bonus_points + self.region_control_points


def compute_team_scores(
    provinces: Sequence,
    team_by_user: dict[int, int],
    difficulty_by_slug: dict[str, str] | None = None,
    with_region_control: bool = True,
) -> dict[int, TeamScore]:
    """Per-team score over province rows.

    A user missing from team_by_user contributes nothing (e.g. a player who
    left the lobby).
    """
    difficulty_by_slug = difficulty_by_slug or {}
    scores: dict[int, TeamScore] = {}

    for p in provinces:
        difficulty = difficulty_by_slug.get(p.problem_title_slug)

        if p.captured_by is not None and p.captured_by in team_by_user:
            score = scores.setdefault(team_by_user[p.captured_by], TeamScore())
            score.provinces += 1
            score.base_points += flag_points(difficulty)

        if p.first_captured_by is not None and p.first_captured_by in team_by_user:
            score = scores.setdefault(team_by_user[p.first_captured_by], TeamScore())
            score.bonus_points += first_capture_bonus(difficulty)

    if with_region_control:
        region_sizes = Counter(p.region_id for p in provinces)
        for region_id, team in region_control_by_team(provinces, team_by_user).items():
            score = scores.setdefault(team, TeamScore())
            score.region_control_points += region_control_bonus(region_sizes[region_id])

    return scores


def compute_score(
    provinces: list[WeeklyMapProvince],
    current_user_id: int,
    friend_id: int,
    difficulty_by_slug: dict[str, str] | None = None,
) -> ScoreResponse:
    """1v1 weekly-map score shape; delegates the point math to the team scorer.

    Weekly maps predate the region-control bonus and stay without it.
    """
    team_scores = compute_team_scores(
        provinces,
        {current_user_id: current_user_id, friend_id: friend_id},
        difficulty_by_slug,
        with_region_control=False,
    )
    player = team_scores.get(current_user_id, TeamScore())
    friend = team_scores.get(friend_id, TeamScore())
    total = len(provinces)

    total_regions = len(set(p.region_id for p in provinces))

    region_counts: dict[str, dict[str, int]] = {}
    for p in provinces:
        r = region_counts.setdefault(p.region_id, {"player": 0, "friend": 0})
        if p.captured_by == current_user_id:
            r["player"] += 1
        elif p.captured_by == friend_id:
            r["friend"] += 1

    player_regions = 0
    friend_regions = 0
    for r, counts in region_counts.items():
        if counts["player"] > counts["friend"]:
            player_regions += 1
        elif counts["friend"] > counts["player"]:
            friend_regions += 1

    return ScoreResponse(
        player_provinces=player.provinces,
        friend_provinces=friend.provinces,
        neutral_provinces=total - player.provinces - friend.provinces,
        total_provinces=total,
        player_regions=player_regions,
        friend_regions=friend_regions,
        total_regions=total_regions,
        player_base_points=player.base_points,
        friend_base_points=friend.base_points,
        player_bonus_points=player.bonus_points,
        friend_bonus_points=friend.bonus_points,
        player_points=player.total_points,
        friend_points=friend.total_points,
    )
