"""Assembly of map API responses: ownership checks, loading, serialization."""

import asyncio
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.friendship import Friendship
from app.models.leetcode_problem import LeetCodeProblem
from app.models.user import User
from app.models.weekly_map import WeeklyMap
from app.models.weekly_map_province import WeeklyMapProvince
from app.schemas.maps import (
    LastWeekResult,
    ProblemResponse,
    ProvinceResponse,
    WeeklyMapResponse,
)
from app.services.leetcode_client import LeetCodeClient
from app.services.map_config import REGION_NAMES
from app.services.scoring import compute_score


def get_owned_friendship(
    friendship_id: int,
    current_user: User,
    db: Session,
) -> Friendship:
    friendship = db.get(Friendship, friendship_id)
    if friendship is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friendship not found",
        )
    if current_user.id not in (friendship.user_a_id, friendship.user_b_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your friendship",
        )
    return friendship


def get_friend(friendship: Friendship, current_user_id: int, db: Session) -> User:
    friend_id = (
        friendship.user_b_id
        if friendship.user_a_id == current_user_id
        else friendship.user_a_id
    )
    friend = db.get(User, friend_id)
    if friend is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Friend user not found",
        )
    return friend


def load_map_context(
    weekly_map: WeeklyMap,
    db: Session,
) -> tuple[list[WeeklyMapProvince], dict[str, LeetCodeProblem], dict[int, str]]:
    """Load a map's provinces plus their problems and captor usernames."""
    provinces = (
        db.query(WeeklyMapProvince)
        .filter(WeeklyMapProvince.weekly_map_id == weekly_map.id)
        .all()
    )
    if not provinces:
        return [], {}, {}

    slugs = {p.problem_title_slug for p in provinces}
    problems = {
        p.title_slug: p
        for p in db.query(LeetCodeProblem).filter(
            LeetCodeProblem.title_slug.in_(slugs)
        ).all()
    }

    capture_user_ids = {p.captured_by for p in provinces if p.captured_by is not None}
    capture_username_by_id: dict[int, str] = {}
    if capture_user_ids:
        users = db.query(User).filter(User.id.in_(capture_user_ids)).all()
        capture_username_by_id = {u.id: u.leetcode_username for u in users}

    return provinces, problems, capture_username_by_id


def build_province_response(
    province: WeeklyMapProvince,
    problem: LeetCodeProblem | None,
    capture_username_by_id: dict[int, str] | None = None,
) -> ProvinceResponse:
    problem_resp = None
    if problem:
        problem_resp = ProblemResponse(
            title=problem.title,
            title_slug=problem.title_slug,
            difficulty=problem.difficulty,
            url=f"https://leetcode.com/problems/{problem.title_slug}/",
        )

    captured_by_username = None
    if province.captured_by and capture_username_by_id:
        captured_by_username = capture_username_by_id.get(province.captured_by)

    return ProvinceResponse(
        province_id=province.province_id,
        region_id=province.region_id,
        region_name=REGION_NAMES.get(province.region_id, province.region_id),
        problem=problem_resp,
        captured_by=province.captured_by,
        captured_by_username=captured_by_username,
        captured_at=province.captured_at,
        captured_submission_url=province.captured_submission_url,
        capturer_leetcode_username=province.capturer_leetcode_username,
        captured_runtime_ms=province.captured_runtime_ms,
        first_captured_by=province.first_captured_by,
        first_captured_at=province.first_captured_at,
    )


async def fetch_avatars(user_a: User, user_b: User) -> tuple[str | None, str | None]:
    try:
        client = LeetCodeClient()
        results = await asyncio.gather(
            client.get_user_profile(user_a.leetcode_username),
            client.get_user_profile(user_b.leetcode_username),
            return_exceptions=True,
        )
        avatar_a = results[0].avatar_url if not isinstance(results[0], Exception) else None
        avatar_b = results[1].avatar_url if not isinstance(results[1], Exception) else None
        return avatar_a, avatar_b
    except Exception:
        return None, None


def get_last_week_result(
    friendship_id: int,
    current_week_start: date,
    current_user_id: int,
    friend_id: int,
    db: Session,
) -> LastWeekResult | None:
    last_week_monday = current_week_start - timedelta(days=7)

    last_map = (
        db.query(WeeklyMap)
        .filter(
            WeeklyMap.friendship_id == friendship_id,
            WeeklyMap.week_start == last_week_monday,
        )
        .first()
    )

    if last_map is None:
        return None

    provinces = (
        db.query(WeeklyMapProvince)
        .filter(WeeklyMapProvince.weekly_map_id == last_map.id)
        .all()
    )

    score = compute_score(provinces, current_user_id, friend_id)

    winner_id: int | None = None
    winner_username: str | None = None

    if score.player_regions > score.friend_regions:
        winner_id = current_user_id
    elif score.friend_regions > score.player_regions:
        winner_id = friend_id

    if winner_id is not None:
        winner = db.get(User, winner_id)
        winner_username = winner.leetcode_username if winner else None

    return LastWeekResult(
        week_start=last_week_monday,
        winner_user_id=winner_id,
        winner_username=winner_username,
        player_regions=score.player_regions,
        friend_regions=score.friend_regions,
        total_regions=score.total_regions,
    )


def build_map_response(
    weekly_map: WeeklyMap,
    db: Session,
    current_user_id: int,
    friend_id: int,
    player_avatar_url: str | None = None,
    friend_avatar_url: str | None = None,
    last_week_result: LastWeekResult | None = None,
) -> WeeklyMapResponse:
    provinces, problems, capture_username_by_id = load_map_context(weekly_map, db)

    return WeeklyMapResponse(
        week_start=weekly_map.week_start,
        friendship_id=weekly_map.friendship_id,
        provinces=[
            build_province_response(
                p,
                problems.get(p.problem_title_slug),
                capture_username_by_id,
            )
            for p in provinces
        ],
        score=compute_score(
            provinces,
            current_user_id,
            friend_id,
            {slug: p.difficulty for slug, p in problems.items()},
        ),
        player_avatar_url=player_avatar_url,
        friend_avatar_url=friend_avatar_url,
        last_week_result=last_week_result,
    )
