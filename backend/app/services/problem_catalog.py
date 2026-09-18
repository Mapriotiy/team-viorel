import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.leetcode_problem import LeetCodeProblem
from app.services.leetcode_client import LeetCodeClient

logger = logging.getLogger(__name__)

CATALOG_REFRESH_INTERVAL_DAYS = 7
PROBLEMSET_PAGE_SIZE = 100
MIN_PROBLEMS = 500
CONCURRENCY = 3


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _fetch_page(client: LeetCodeClient, skip: int, sem: asyncio.Semaphore, retries: int = 2) -> tuple[int, list[dict]]:
    for attempt in range(retries):
        async with sem:
            await asyncio.sleep(0.8)
            total, questions = await client.get_problemset_list(skip=skip, limit=PROBLEMSET_PAGE_SIZE)
        if questions or attempt == retries - 1:
            return total, questions
        logger.warning("Retrying page skip=%d (attempt %d)", skip, attempt + 2)
    return 0, []


async def refresh_catalog(db: Session) -> int:
    client = LeetCodeClient()
    sem = asyncio.Semaphore(CONCURRENCY)

    total, first_questions = await client.get_problemset_list(skip=0, limit=PROBLEMSET_PAGE_SIZE)
    if not first_questions:
        logger.warning("First page returned 0 problems")
        return 0

    tasks = [
        _fetch_page(client, page_skip, sem)
        for page_skip in range(PROBLEMSET_PAGE_SIZE, total, PROBLEMSET_PAGE_SIZE)
    ]

    all_pages = await asyncio.gather(*tasks, return_exceptions=True)

    all_rows: list[dict] = []
    for q in first_questions:
        all_rows.append({
            "frontend_id": q["frontend_id"],
            "title": q["title"],
            "title_slug": q["title_slug"],
            "difficulty": q["difficulty"],
            "topic_tags": q["topic_tags"],
            "updated_at": _utcnow(),
        })

    for result in all_pages:
        if isinstance(result, Exception):
            logger.warning("Page fetch failed: %s", result)
            continue
        _, questions = result
        for q in questions:
            all_rows.append({
                "frontend_id": q["frontend_id"],
                "title": q["title"],
                "title_slug": q["title_slug"],
                "difficulty": q["difficulty"],
                "topic_tags": q["topic_tags"],
                "updated_at": _utcnow(),
            })

    if len(all_rows) < MIN_PROBLEMS:
        logger.warning("Fetched only %d problems — keeping existing catalog", len(all_rows))
        return 0 if not db.query(LeetCodeProblem).count() else len(all_rows)

    new_slugs = {r["title_slug"] for r in all_rows}
    _bulk_upsert(db, all_rows)
    db.query(LeetCodeProblem).filter(
        ~LeetCodeProblem.title_slug.in_(new_slugs)
    ).delete(synchronize_session=False)
    db.commit()

    logger.info("refresh_catalog: %d problems", len(all_rows))
    return len(all_rows)


def _bulk_upsert(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert

    dialect_name = db.bind.dialect.name
    insert_fn = pg_insert if dialect_name == "postgresql" else sqlite_insert

    excluded = insert_fn(LeetCodeProblem).excluded

    stmt = (
        insert_fn(LeetCodeProblem)
        .values(rows)
        .on_conflict_do_update(
            index_elements=["title_slug"],
            set_={
                "title": excluded.title,
                "frontend_id": excluded.frontend_id,
                "difficulty": excluded.difficulty,
                "topic_tags": excluded.topic_tags,
                "updated_at": excluded.updated_at,
            },
        )
    )
    db.execute(stmt)
    db.commit()


def needs_refresh(db: Session) -> bool:
    count = db.query(LeetCodeProblem).count()
    if count == 0:
        return True
    if count < MIN_PROBLEMS:
        return True
    latest = (
        db.query(LeetCodeProblem.updated_at)
        .order_by(LeetCodeProblem.updated_at.desc())
        .first()
    )
    age = _utcnow() - latest[0].replace(tzinfo=timezone.utc) if latest[0].tzinfo is None else _utcnow() - latest[0]
    return age.days >= CATALOG_REFRESH_INTERVAL_DAYS


def catalog_problem_count(db: Session) -> int:
    return db.query(LeetCodeProblem).count()


def catalog_has_minimum(db: Session, minimum: int = MIN_PROBLEMS) -> bool:
    return catalog_problem_count(db) >= minimum


def get_problems_by_tags(
    tags: list[str],
    difficulty: str | None,
    exclude_slugs: set[str],
    db: Session,
) -> list[LeetCodeProblem]:
    query = select(LeetCodeProblem)
    if difficulty:
        query = query.where(LeetCodeProblem.difficulty == difficulty)

    rows = db.execute(query).scalars().all()

    result = []
    for p in rows:
        if p.title_slug in exclude_slugs:
            continue
        if not tags:
            result.append(p)
            continue
        problem_tags = set(p.topic_tags)
        if not problem_tags:
            continue
        if problem_tags & set(tags):
            result.append(p)

    return result


def get_any_unsolved(exclude_slugs: set[str], db: Session) -> list[LeetCodeProblem]:
    rows = db.execute(select(LeetCodeProblem)).scalars().all()
    return [p for p in rows if p.title_slug not in exclude_slugs]


async def ensure_catalog(db: Session, force: bool = False) -> None:
    try:
        if force or needs_refresh(db):
            count = await refresh_catalog(db)
            if count == 0:
                logger.error("Catalog refresh returned 0 problems — map generation may fail")
    except Exception:
        logger.exception("ensure_catalog failed")
        return
