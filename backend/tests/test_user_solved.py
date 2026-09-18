from datetime import datetime

from app.models.user import User
from app.models.user_solved import UserSolved
from app.schemas.leetcode import RecentAcceptedSubmission
from app.services.user_solved import get_solved_for_slugs, record_submissions


def make_submission(
    slug: str,
    submitted_at: str,
    runtime_ms: int | None = None,
    submission_id: int = 1,
) -> RecentAcceptedSubmission:
    return RecentAcceptedSubmission(
        title=slug,
        title_slug=slug,
        url=f"https://leetcode.com/problems/{slug}/",
        submitted_at=submitted_at,
        submission_id=submission_id,
        submission_url=f"https://leetcode.com/submissions/detail/{submission_id}/",
        runtime_ms=runtime_ms,
    )


def make_user(db, username: str = "alice") -> User:
    user = User(leetcode_username=username, leetcode_verified_at=datetime(2026, 7, 27, 12, 0))
    db.add(user)
    db.commit()
    return user


def get_row(db, user_id: int, slug: str) -> UserSolved:
    return (
        db.query(UserSolved)
        .filter(UserSolved.user_id == user_id, UserSolved.title_slug == slug)
        .one()
    )


def test_inserts_new_solve_with_runtime(db):
    user = make_user(db)
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-27T10:00:00+00:00", runtime_ms=120)],
        db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.solved_at == datetime(2026, 7, 27, 10, 0, 0)
    assert row.best_runtime_ms == 120
    assert row.best_submission_url == "https://leetcode.com/submissions/detail/1/"
    assert row.best_runtime_at == datetime(2026, 7, 27, 10, 0, 0)


def test_resolve_does_not_move_solved_at_forward(db):
    user = make_user(db)
    record_submissions(
        user.id, [make_submission("two-sum", "2026-07-20T10:00:00+00:00")], db,
    )
    record_submissions(
        user.id, [make_submission("two-sum", "2026-07-27T10:00:00+00:00")], db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.solved_at == datetime(2026, 7, 20, 10, 0, 0)


def test_earlier_solve_moves_solved_at_back(db):
    user = make_user(db)
    record_submissions(
        user.id, [make_submission("two-sum", "2026-07-27T10:00:00+00:00")], db,
    )
    record_submissions(
        user.id, [make_submission("two-sum", "2026-07-20T10:00:00+00:00")], db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.solved_at == datetime(2026, 7, 20, 10, 0, 0)


def test_faster_runtime_updates_best(db):
    user = make_user(db)
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-20T10:00:00+00:00", runtime_ms=200, submission_id=1)],
        db,
    )
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-27T10:00:00+00:00", runtime_ms=90, submission_id=2)],
        db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.best_runtime_ms == 90
    assert row.best_submission_url == "https://leetcode.com/submissions/detail/2/"
    assert row.best_runtime_at == datetime(2026, 7, 27, 10, 0, 0)


def test_slower_runtime_keeps_best(db):
    user = make_user(db)
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-20T10:00:00+00:00", runtime_ms=90, submission_id=1)],
        db,
    )
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-27T10:00:00+00:00", runtime_ms=200, submission_id=2)],
        db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.best_runtime_ms == 90
    assert row.best_submission_url == "https://leetcode.com/submissions/detail/1/"


def test_missing_runtime_does_not_clobber_best(db):
    user = make_user(db)
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-20T10:00:00+00:00", runtime_ms=90)],
        db,
    )
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-27T10:00:00+00:00", runtime_ms=None)],
        db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.best_runtime_ms == 90


def test_zero_runtime_beats_any_best(db):
    user = make_user(db)
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-20T10:00:00+00:00", runtime_ms=1, submission_id=1)],
        db,
    )
    record_submissions(
        user.id,
        [make_submission("two-sum", "2026-07-27T10:00:00+00:00", runtime_ms=0, submission_id=2)],
        db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.best_runtime_ms == 0


def test_duplicate_slugs_in_one_batch_fold_to_best(db):
    user = make_user(db)
    record_submissions(
        user.id,
        [
            make_submission("two-sum", "2026-07-27T10:00:00+00:00", runtime_ms=200, submission_id=1),
            make_submission("two-sum", "2026-07-26T09:00:00+00:00", runtime_ms=90, submission_id=2),
        ],
        db,
    )

    row = get_row(db, user.id, "two-sum")
    assert row.solved_at == datetime(2026, 7, 26, 9, 0, 0)
    assert row.best_runtime_ms == 90
    assert row.best_submission_url == "https://leetcode.com/submissions/detail/2/"


def test_get_solved_for_slugs_filters(db):
    user = make_user(db)
    record_submissions(
        user.id,
        [
            make_submission("two-sum", "2026-07-27T10:00:00+00:00"),
            make_submission("three-sum", "2026-07-27T11:00:00+00:00"),
        ],
        db,
    )

    rows = get_solved_for_slugs(user.id, {"two-sum", "unrelated"}, db)
    assert set(rows.keys()) == {"two-sum"}
    assert get_solved_for_slugs(user.id, set(), db) == {}
