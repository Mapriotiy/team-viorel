from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.user_solved import UserSolved
from app.schemas.leetcode import RecentAcceptedSubmission


def _parse_submitted_at(submitted_at_iso: str) -> datetime:
    """Parse an ISO timestamp to naive UTC, matching how the DB stores datetimes."""
    parsed = datetime.fromisoformat(submitted_at_iso)
    if parsed.tzinfo is None:
        return parsed
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


@dataclass
class _BatchEntry:
    language: str
    solved_at: datetime
    best_runtime_ms: int | None = None
    best_submission_url: str | None = None
    best_runtime_at: datetime | None = None


LANGUAGE_ALIASES = {
    "python3": "python3",
    "python 3": "python3",
    "python": "python3",
    "c++": "cpp",
    "cpp": "cpp",
    "java": "java",
    "javascript": "javascript",
    "typescript": "typescript",
    "c#": "csharp",
    "csharp": "csharp",
    "go": "golang",
    "golang": "golang",
    "rust": "rust",
}


def normalize_language(language: str | None) -> str:
    value = (language or "unknown").strip().lower()
    return LANGUAGE_ALIASES.get(value, value or "unknown")


def _fold_batch(submissions: list[RecentAcceptedSubmission]) -> dict[tuple[str, str], _BatchEntry]:
    """Reduce a submission batch to earliest solve and fastest runtime per slug."""
    batch: dict[tuple[str, str], _BatchEntry] = {}

    for sub in submissions:
        solved_at = _parse_submitted_at(sub.submitted_at)
        language = normalize_language(sub.language)
        key = (sub.title_slug, language)
        entry = batch.get(key)

        if entry is None:
            entry = _BatchEntry(language=language, solved_at=solved_at)
            batch[key] = entry
        elif solved_at < entry.solved_at:
            entry.solved_at = solved_at

        if sub.runtime_ms is not None and (
            entry.best_runtime_ms is None or sub.runtime_ms < entry.best_runtime_ms
        ):
            entry.best_runtime_ms = sub.runtime_ms
            entry.best_submission_url = sub.submission_url
            entry.best_runtime_at = solved_at

    return batch


def _apply_batch(user_id: int, batch: dict[tuple[str, str], _BatchEntry], db: Session) -> None:
    slugs = {slug for slug, _ in batch}
    languages = {language for _, language in batch}
    existing_rows = {
        (row.title_slug, row.language): row
        for row in db.query(UserSolved)
        .filter(
            UserSolved.user_id == user_id,
            UserSolved.title_slug.in_(slugs),
            UserSolved.language.in_(languages),
        )
        .all()
    }

    for (slug, language), entry in batch.items():
        row = existing_rows.get((slug, language))

        if row is None:
            db.add(
                UserSolved(
                    user_id=user_id,
                    title_slug=slug,
                    language=entry.language,
                    solved_at=entry.solved_at,
                    best_runtime_ms=entry.best_runtime_ms,
                    best_submission_url=entry.best_submission_url,
                    best_runtime_at=entry.best_runtime_at,
                )
            )
            continue

        # A re-solve must never move the first-solve timestamp forward.
        if entry.solved_at < row.solved_at:
            row.solved_at = entry.solved_at

        if entry.best_runtime_ms is not None and (
            row.best_runtime_ms is None or entry.best_runtime_ms < row.best_runtime_ms
        ):
            row.best_runtime_ms = entry.best_runtime_ms
            row.best_submission_url = entry.best_submission_url
            row.best_runtime_at = entry.best_runtime_at


def record_submissions(
    user_id: int,
    submissions: list[RecentAcceptedSubmission],
    db: Session,
) -> None:
    """Merge recent accepted submissions into UserSolved.

    Keeps the earliest solved_at and the fastest runtime (with its submission
    URL and time) per (user, problem).
    """
    if not submissions:
        return

    batch = _fold_batch(submissions)
    if not batch:
        return

    _apply_batch(user_id, batch, db)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent sync inserted the same (user, slug) first; the rows
        # exist now, so a second pass reduces to pure updates.
        db.rollback()
        _apply_batch(user_id, batch, db)
        db.commit()


def get_solved_slugs(user_id: int, db: Session, language: str | None = None) -> set[str]:
    filters = [UserSolved.user_id == user_id]
    if language is not None:
        filters.append(UserSolved.language == normalize_language(language))
    rows = (
        db.query(UserSolved.title_slug)
        .filter(*filters)
        .all()
    )
    return {row[0] for row in rows}


def get_solved_slugs_with_timestamps(
    user_id: int, db: Session, language: str | None = None,
) -> dict[str, datetime]:
    filters = [UserSolved.user_id == user_id]
    if language is not None:
        filters.append(UserSolved.language == normalize_language(language))
    rows = (
        db.query(UserSolved.title_slug, UserSolved.solved_at)
        .filter(*filters)
        .order_by(UserSolved.solved_at.asc())
        .all()
    )
    solved: dict[str, datetime] = {}
    for slug, solved_at in rows:
        solved.setdefault(slug, solved_at)
    return solved


def get_solved_for_slugs(
    user_id: int, slugs: set[str], db: Session, language: str | None = None,
) -> dict[str, UserSolved]:
    if not slugs:
        return {}
    filters = [
        UserSolved.user_id == user_id,
        UserSolved.title_slug.in_(slugs),
    ]
    if language is not None:
        filters.append(UserSolved.language == normalize_language(language))
    rows = (
        db.query(UserSolved)
        .filter(*filters)
        .order_by(UserSolved.solved_at.asc())
        .all()
    )
    solved: dict[str, UserSolved] = {}
    for row in rows:
        solved.setdefault(row.title_slug, row)
    return solved
