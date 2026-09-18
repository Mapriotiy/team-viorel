"""Capture logic: decides province ownership from the players' solves.

Rules:
- Initial capture: earliest eligible solve wins (timestamp ties go to the
  player earliest in tiebreak_order, matching historical 1v1 behavior).
- Defense: the owning team's best runtime is kept up to date on the province,
  so a faster re-solve raises the bar before any steal check in the same
  pass. A faster solve by a teammate transfers ownership to that teammate
  (friendly takeover) while the team keeps the province.
- Recapture: a challenger from another team steals only with a strictly
  faster runtime. Equal runtimes keep the incumbent. A challenger without
  runtime data can never steal; an incumbent without stored runtime is
  beatable by any timed solve.
- Only solves timestamped at/after `since` count, for both capture and
  recapture.
- first_captured_by is never changed once set: the first-capture bonus is
  permanent.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol, Sequence

from app.models.user_solved import UserSolved

logger = logging.getLogger(__name__)

CAPTURE = "capture"
RECAPTURE = "recapture"
DEFENSE = "defense"
REGION_CONTROL = "region_control"
REGION_CONTROL_LOST = "region_control_lost"


class ProvinceLike(Protocol):
    """Structural type for capturable board cells (weekly or lobby provinces)."""

    province_id: str
    problem_title_slug: str
    captured_by: int | None
    captured_at: datetime | None
    captured_runtime_ms: int | None
    captured_submission_url: str | None
    capturer_leetcode_username: str | None
    first_captured_by: int | None
    first_captured_at: datetime | None


@dataclass
class CaptureChange:
    kind: str  # CAPTURE | RECAPTURE | DEFENSE | REGION_CONTROL(_LOST)
    province: ProvinceLike
    actor_user_id: int
    previous_owner_user_id: int | None = None
    runtime_ms: int | None = None
    previous_runtime_ms: int | None = None
    # Event point value; defaults to the province's flag value when recorded.
    points: int | None = None


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive_utc(dt: datetime) -> datetime:
    """UserSolved timestamps are naive UTC; normalize aware inputs to match."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def apply_capture_pass(
    provinces: Sequence[ProvinceLike],
    solved_by_user: dict[int, dict[str, UserSolved]],
    username_by_id: dict[int, str],
    since: datetime,
    tiebreak_order: list[int],
    team_by_user: dict[int, int] | None = None,
    blocked_recapture_ids: set[str] = frozenset(),
) -> list[CaptureChange]:
    """Pure capture/defense/recapture pass over province rows.

    Mutates the given provinces in place and returns the changes; committing
    is the caller's job. With team_by_user=None every player is their own
    team (free-for-all). Provinces whose id is in blocked_recapture_ids keep
    their owner (defense still updates the bar) but cannot be stolen.
    """
    since = _naive_utc(since)
    if team_by_user is None:
        team_by_user = {}
    rank = {user_id: i for i, user_id in enumerate(tiebreak_order)}
    changes: list[CaptureChange] = []

    def team_of(user_id: int) -> int:
        return team_by_user.get(user_id, user_id)

    for province in provinces:
        slug = province.problem_title_slug
        rows = {
            user_id: row
            for user_id, solved in solved_by_user.items()
            if (row := _eligible(solved.get(slug), since)) is not None
        }

        if province.captured_by is None:
            winner_id = _pick_earliest(rows, rank)
            if winner_id is None:
                continue
            winner = rows[winner_id]
            _set_owner(province, winner_id, winner, username_by_id.get(winner_id, "?"))
            province.captured_at = winner.solved_at
            changes.append(
                CaptureChange(
                    kind=CAPTURE,
                    province=province,
                    actor_user_id=winner_id,
                    runtime_ms=winner.best_runtime_ms,
                )
            )
        else:
            owner_id = province.captured_by
            owner_team = team_of(owner_id)

            # Defense first, so the owning team's faster re-solve in the same
            # sync raises the bar before the steal check. A faster teammate
            # takes over the flag for the team.
            defender_id = _pick_fastest(
                rows, rank,
                lambda uid: team_of(uid) == owner_team,
                province.captured_runtime_ms,
            )
            if defender_id is not None:
                defender = rows[defender_id]
                previous_runtime = province.captured_runtime_ms
                previous_owner = owner_id
                _set_owner(
                    province, defender_id, defender,
                    username_by_id.get(defender_id, "?"),
                )
                changes.append(
                    CaptureChange(
                        kind=DEFENSE,
                        province=province,
                        actor_user_id=defender_id,
                        previous_owner_user_id=(
                            previous_owner if defender_id != previous_owner else None
                        ),
                        runtime_ms=defender.best_runtime_ms,
                        previous_runtime_ms=previous_runtime,
                    )
                )

            if province.province_id in blocked_recapture_ids:
                continue

            challenger_id = _pick_fastest(
                rows, rank,
                lambda uid: team_of(uid) != owner_team,
                province.captured_runtime_ms,
            )
            if challenger_id is not None:
                challenger = rows[challenger_id]
                incumbent_runtime = province.captured_runtime_ms
                changes.append(
                    CaptureChange(
                        kind=RECAPTURE,
                        province=province,
                        actor_user_id=challenger_id,
                        previous_owner_user_id=province.captured_by,
                        runtime_ms=challenger.best_runtime_ms,
                        previous_runtime_ms=incumbent_runtime,
                    )
                )
                _set_owner(
                    province, challenger_id, challenger,
                    username_by_id.get(challenger_id, "?"),
                )
                province.captured_at = challenger.best_runtime_at or _utcnow_naive()

        if province.captured_by is not None and province.first_captured_by is None:
            province.first_captured_by = province.captured_by
            province.first_captured_at = province.captured_at

    return changes


def _eligible(row: UserSolved | None, since: datetime) -> UserSolved | None:
    """Only solves at/after the cutoff count for capture or recapture."""
    if row is None or row.solved_at < since:
        return None
    return row


def _pick_earliest(
    rows: dict[int, UserSolved], rank: dict[int, int],
) -> int | None:
    """Earliest solve wins; timestamp ties go to the lowest tiebreak rank."""
    if not rows:
        return None
    return min(
        rows,
        key=lambda uid: (rows[uid].solved_at, rank.get(uid, len(rank))),
    )


def _pick_fastest(
    rows: dict[int, UserSolved],
    rank: dict[int, int],
    include,
    bar_runtime_ms: int | None,
) -> int | None:
    """Fastest solver strictly under the bar (any timed solve beats a NULL bar).

    Ties go to the earliest best_runtime_at, then the lowest tiebreak rank.
    """
    candidates = [
        uid
        for uid, row in rows.items()
        if include(uid)
        and row.best_runtime_ms is not None
        and (bar_runtime_ms is None or row.best_runtime_ms < bar_runtime_ms)
    ]
    if not candidates:
        return None
    far_future = datetime.max
    return min(
        candidates,
        key=lambda uid: (
            rows[uid].best_runtime_ms,
            rows[uid].best_runtime_at or far_future,
            rank.get(uid, len(rank)),
        ),
    )


def _set_owner(
    province: ProvinceLike,
    user_id: int,
    row: UserSolved,
    username: str,
) -> None:
    province.captured_by = user_id
    province.captured_runtime_ms = row.best_runtime_ms
    province.captured_submission_url = row.best_submission_url
    province.capturer_leetcode_username = username
