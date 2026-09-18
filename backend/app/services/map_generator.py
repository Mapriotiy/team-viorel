import asyncio
import logging
import random

from sqlalchemy.orm import Session

from app.models.leetcode_problem import LeetCodeProblem
from app.models.map_event import MapEvent
from app.models.weekly_map import WeeklyMap
from app.models.weekly_map_province import WeeklyMapProvince
from app.services.leetcode_client import LeetCodeClient
from app.services.map_config import (
    PROVINCE_REGION,
    REGION_TOPICS,
    get_week_start,
)
from app.services.problem_catalog import ensure_catalog
from app.services.problem_picker import pick_problem
from app.services.user_solved import (
    get_solved_slugs_with_timestamps,
    record_submissions,
)

logger = logging.getLogger(__name__)


async def get_or_create_weekly_map(
    friendship_id: int,
    user_a_id: int,
    user_b_id: int,
    db: Session,
    leetcode_username_a: str | None = None,
    leetcode_username_b: str | None = None,
    reset: bool = False,
) -> WeeklyMap:
    week_start = get_week_start()

    if reset:
        existing_map = (
            db.query(WeeklyMap)
            .filter(
                WeeklyMap.friendship_id == friendship_id,
                WeeklyMap.week_start == week_start,
            )
            .first()
        )
        if existing_map:
            # SQLite runs without FK enforcement, so cascades never fire;
            # children must be deleted explicitly.
            db.query(MapEvent).filter(
                MapEvent.weekly_map_id == existing_map.id
            ).delete()
            db.query(WeeklyMapProvince).filter(
                WeeklyMapProvince.weekly_map_id == existing_map.id
            ).delete()
            db.delete(existing_map)
            db.commit()

    existing = (
        db.query(WeeklyMap)
        .filter(
            WeeklyMap.friendship_id == friendship_id,
            WeeklyMap.week_start == week_start,
        )
        .first()
    )
    if existing:
        return existing

    await ensure_catalog(db, force=reset)

    if leetcode_username_a and leetcode_username_b:
        client = LeetCodeClient()
        try:
            subs_a, subs_b = await asyncio.gather(
                client.get_recent_accepted_submissions(leetcode_username_a, limit=100),
                client.get_recent_accepted_submissions(leetcode_username_b, limit=100),
            )
            if subs_a:
                record_submissions(user_a_id, subs_a, db)
            if subs_b:
                record_submissions(user_b_id, subs_b, db)
        except Exception:
            logger.warning("Failed to fetch recent submissions for map exclusion", exc_info=True)

    solved_a = get_solved_slugs_with_timestamps(user_a_id, db)
    solved_b = get_solved_slugs_with_timestamps(user_b_id, db)
    exclude = set(solved_a.keys()) | set(solved_b.keys())

    weekly_map = WeeklyMap(
        friendship_id=friendship_id,
        week_start=week_start,
    )
    db.add(weekly_map)
    db.flush()

    used_slugs: set[str] = set()

    prov_items = list(PROVINCE_REGION.items())
    random.shuffle(prov_items)

    total = len(prov_items)
    easy_target = round(total * 0.50)
    medium_target = round(total * 0.35)
    hard_count = total - easy_target - medium_target

    difficulty_order: list[str] = ["Easy"] * easy_target + ["Medium"] * medium_target + ["Hard"] * hard_count
    random.shuffle(difficulty_order)

    isle3_idx = next(i for i, (pid, _) in enumerate(prov_items) if pid == "path53")
    if difficulty_order[isle3_idx] != "Hard":
        hard_idx = next(i for i, d in enumerate(difficulty_order) if d == "Hard")
        difficulty_order[isle3_idx], difficulty_order[hard_idx] = difficulty_order[hard_idx], difficulty_order[isle3_idx]

    for (province_id, region_id), pick_difficulty in zip(prov_items, difficulty_order):
        config = REGION_TOPICS.get(region_id, {"tags": [], "difficulty": None})

        problem = _pick_problem(
            tags=config["tags"],
            difficulty=pick_difficulty,
            exclude=exclude | used_slugs,
            db=db,
        )

        if problem is None:
            problem = _pick_problem(
                tags=[],
                difficulty=pick_difficulty,
                exclude=exclude | used_slugs,
                db=db,
            )

        if problem is None:
            problem = _pick_problem(
                tags=[],
                difficulty=None,
                exclude=exclude | used_slugs,
                db=db,
            )

        if problem is None:
            logger.warning(
                "No problem found for province %s (region %s)",
                province_id, region_id,
            )
            continue

        used_slugs.add(problem.title_slug)

        province = WeeklyMapProvince(
            weekly_map_id=weekly_map.id,
            province_id=province_id,
            region_id=region_id,
            problem_title_slug=problem.title_slug,
        )
        db.add(province)

    db.commit()
    db.refresh(weekly_map)
    return weekly_map


# Kept as an alias for this dormant weekly-map module; the shared picker
# lives in problem_picker.py.
_pick_problem = pick_problem
