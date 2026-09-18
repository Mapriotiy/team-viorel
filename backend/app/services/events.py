"""Recording and reading game events (captures, recaptures, defenses)."""

from collections import Counter

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.friendship import Friendship
from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby import Lobby
from app.models.lobby_event import LobbyEvent
from app.models.lobby_map import LobbyMap
from app.models.lobby_map_province import LobbyMapProvince
from app.models.map_event import MapEvent
from app.models.user import User
from app.models.weekly_map import WeeklyMap
from app.services.capture_engine import (
    REGION_CONTROL,
    REGION_CONTROL_LOST,
    CaptureChange,
)
from app.services.scoring import (
    flag_points,
    region_control_bonus,
)


def region_control_changes(
    provinces,
    changes: list[CaptureChange],
    control_before: dict[str, int],
    control_after: dict[str, int],
) -> list[CaptureChange]:
    """Turn a region-control diff into loggable events.

    Each event is attached to the capture/recapture in that region that
    completed or broke full control (the last one in the pass).
    """
    region_sizes = Counter(p.region_id for p in provinces)
    events: list[CaptureChange] = []

    for region_id in sorted(set(control_before) | set(control_after)):
        before = control_before.get(region_id)
        after = control_after.get(region_id)
        if before == after:
            continue

        trigger = next(
            (c for c in reversed(changes) if c.province.region_id == region_id),
            None,
        )
        if trigger is None:
            continue
        bonus = region_control_bonus(region_sizes[region_id])

        if before is not None:
            events.append(
                CaptureChange(
                    kind=REGION_CONTROL_LOST,
                    province=trigger.province,
                    actor_user_id=trigger.actor_user_id,
                    previous_owner_user_id=trigger.previous_owner_user_id,
                    points=bonus,
                )
            )
        if after is not None:
            events.append(
                CaptureChange(
                    kind=REGION_CONTROL,
                    province=trigger.province,
                    actor_user_id=trigger.actor_user_id,
                    points=bonus,
                )
            )

    return events


def record_lobby_events(
    changes: list[CaptureChange],
    lobby: Lobby,
    problems: dict[str, LeetCodeProblem],
    usernames: dict[int, str],
    faction_by_user: dict[int, int | None],
    db: Session,
) -> list[LobbyEvent]:
    events: list[LobbyEvent] = []

    for change in changes:
        slug = change.province.problem_title_slug
        problem = problems.get(slug)
        difficulty = problem.difficulty if problem else None

        event = LobbyEvent(
            lobby_id=lobby.id,
            province_id=change.province.province_id,
            province_name=getattr(change.province, "province_name", None),
            region_name=getattr(change.province, "region_name", None),
            event_type=change.kind,
            actor_user_id=change.actor_user_id,
            actor_username=usernames.get(change.actor_user_id, "?"),
            actor_faction_id=faction_by_user.get(change.actor_user_id),
            previous_owner_user_id=change.previous_owner_user_id,
            previous_owner_username=(
                usernames.get(change.previous_owner_user_id)
                if change.previous_owner_user_id is not None
                else None
            ),
            problem_title_slug=slug,
            problem_title=problem.title if problem else None,
            problem_difficulty=difficulty,
            points=change.points if change.points is not None else flag_points(difficulty),
            runtime_ms=change.runtime_ms,
            previous_runtime_ms=change.previous_runtime_ms,
        )
        db.add(event)
        events.append(event)

    if events:
        db.commit()

    return events


def get_lobby_events(
    lobby_id: int,
    after_id: int,
    limit: int,
    db: Session,
) -> list[LobbyEvent]:
    events = (
        db.query(LobbyEvent)
        .filter(
            LobbyEvent.lobby_id == lobby_id,
            LobbyEvent.id > after_id,
        )
        .order_by(LobbyEvent.id.asc())
        .limit(limit)
        .all()
    )
    _enrich_lobby_event_names(lobby_id, events, db)
    return events


def _enrich_lobby_event_names(
    lobby_id: int,
    events: list[LobbyEvent],
    db: Session,
) -> None:
    province_ids = {
        event.province_id
        for event in events
        if event.province_id and (not event.province_name or not event.region_name)
    }
    if not province_ids:
        return

    lmap = db.query(LobbyMap).filter_by(lobby_id=lobby_id).first()
    if not lmap:
        return

    provinces = (
        db.query(LobbyMapProvince)
        .filter(
            LobbyMapProvince.lobby_map_id == lmap.id,
            LobbyMapProvince.province_id.in_(province_ids),
        )
        .all()
    )
    province_by_id = {province.province_id: province for province in provinces}

    for event in events:
        if not event.province_id:
            continue
        province = province_by_id.get(event.province_id)
        if not province:
            continue
        if not event.province_name:
            event.province_name = province.province_name
        if not event.region_name:
            event.region_name = province.region_name


def record_capture_events(
    changes: list[CaptureChange],
    weekly_map: WeeklyMap,
    problems: dict[str, LeetCodeProblem],
    usernames: dict[int, str],
    db: Session,
) -> list[MapEvent]:
    events: list[MapEvent] = []

    for change in changes:
        slug = change.province.problem_title_slug
        problem = problems.get(slug)
        difficulty = problem.difficulty if problem else None

        event = MapEvent(
            friendship_id=weekly_map.friendship_id,
            weekly_map_id=weekly_map.id,
            province_id=change.province.province_id,
            event_type=change.kind,
            actor_user_id=change.actor_user_id,
            actor_username=usernames.get(change.actor_user_id, "?"),
            previous_owner_user_id=change.previous_owner_user_id,
            previous_owner_username=(
                usernames.get(change.previous_owner_user_id)
                if change.previous_owner_user_id is not None
                else None
            ),
            problem_title_slug=slug,
            problem_title=problem.title if problem else None,
            problem_difficulty=difficulty,
            points=flag_points(difficulty),
            runtime_ms=change.runtime_ms,
            previous_runtime_ms=change.previous_runtime_ms,
        )
        db.add(event)
        events.append(event)

    if events:
        db.commit()

    return events


def get_map_events(
    weekly_map_id: int,
    after_id: int,
    limit: int,
    db: Session,
) -> list[MapEvent]:
    return (
        db.query(MapEvent)
        .filter(
            MapEvent.weekly_map_id == weekly_map_id,
            MapEvent.id > after_id,
        )
        .order_by(MapEvent.id.asc())
        .limit(limit)
        .all()
    )


def get_feed(
    user_id: int,
    limit: int,
    db: Session,
) -> list[tuple[MapEvent, Friendship, str]]:
    """Latest events across all the user's friendships, newest first.

    Returns (event, friendship, friend_username) tuples.
    """
    rows = (
        db.query(MapEvent, Friendship)
        .join(Friendship, MapEvent.friendship_id == Friendship.id)
        .filter(
            or_(
                Friendship.user_a_id == user_id,
                Friendship.user_b_id == user_id,
            )
        )
        .order_by(MapEvent.id.desc())
        .limit(limit)
        .all()
    )

    friend_ids = {
        f.user_b_id if f.user_a_id == user_id else f.user_a_id for _, f in rows
    }
    username_by_id: dict[int, str] = {}
    if friend_ids:
        users = db.query(User).filter(User.id.in_(friend_ids)).all()
        username_by_id = {u.id: u.leetcode_username for u in users}

    result = []
    for event, friendship in rows:
        friend_id = (
            friendship.user_b_id
            if friendship.user_a_id == user_id
            else friendship.user_a_id
        )
        result.append((event, friendship, username_by_id.get(friend_id, "?")))
    return result
