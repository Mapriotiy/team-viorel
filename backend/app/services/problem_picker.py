"""Random problem selection from the catalog, shared by all game modes."""

import random

from sqlalchemy.orm import Session

from app.models.leetcode_problem import LeetCodeProblem
from app.services.problem_catalog import get_any_unsolved, get_problems_by_tags


def pick_problem(
    tags: list[str],
    difficulty: str | None,
    exclude: set[str],
    db: Session,
) -> LeetCodeProblem | None:
    """Random problem matching (tags, difficulty), falling back to any
    problem not in exclude."""
    candidates = get_problems_by_tags(tags, difficulty, exclude, db)
    if not candidates:
        candidates = get_any_unsolved(exclude, db)
    if not candidates:
        return None
    return random.choice(candidates)
