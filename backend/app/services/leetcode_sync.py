import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.db.session import SessionLocal
from app.models.leetcode_sync_state import LeetCodeSyncState
from app.models.user import User
from app.schemas.leetcode import LeetCodeProfileResponse, RecentAcceptedSubmission
from app.services.activity_sync import sync_user_daily_activity_for_user
from app.services.leetcode_client import LeetCodeClient
from app.services.lobby_settings import filter_submissions_by_language

logger = logging.getLogger(__name__)

RECENT_SYNC_COOLDOWN_SECONDS = 60
PROFILE_SYNC_COOLDOWN_SECONDS = 300
LOBBY_SYNC_COOLDOWN_SECONDS = 60
LOBBY_SYNC_STALE_SECONDS = 180


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _user_key(user: User) -> str:
    return _user_key_for(user.id, user.leetcode_username)


def _user_key_for(user_id: int, leetcode_username: str | None) -> str:
    return (leetcode_username or str(user_id)).strip().lower()


def is_leetcode_verified(user: User) -> bool:
    return user.leetcode_verified_at is not None and bool(user.leetcode_username)


def _next_after(state: LeetCodeSyncState, cooldown_seconds: int) -> datetime | None:
    if state.last_synced_at is None:
        return None
    return state.last_synced_at + timedelta(seconds=cooldown_seconds)


def _state_meta(
    status: str,
    state: LeetCodeSyncState,
    cooldown_seconds: int,
    **extra: Any,
) -> dict[str, Any]:
    return {
        "status": status,
        "last_synced_at": state.last_synced_at,
        "next_sync_after": _next_after(state, cooldown_seconds),
        "started_at": state.started_at,
        "error": state.error,
        **extra,
    }


def _cached_profile(state: LeetCodeSyncState) -> LeetCodeProfileResponse | None:
    metadata = state.sync_metadata or {}
    profile_data = metadata.get("profile")
    if not isinstance(profile_data, dict):
        return None
    try:
        return LeetCodeProfileResponse.model_validate(profile_data)
    except Exception:
        logger.warning("Invalid cached LeetCode profile in sync state %s", state.id)
        return None


def get_cached_user_profile(user: User, db: Session) -> LeetCodeProfileResponse | None:
    state = (
        db.query(LeetCodeSyncState)
        .filter_by(scope="profile", sync_key=_user_key(user))
        .first()
    )
    return _cached_profile(state) if state else None


async def sync_user_daily_activity_by_id(user_id: int) -> None:
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if user is None or not is_leetcode_verified(user):
            return
        await maybe_sync_user_daily_activity(user, db)
    except Exception:
        logger.exception("background LeetCode sync failed for user_id=%s", user_id)
    finally:
        db.close()


def _within_cooldown(state: LeetCodeSyncState, cooldown_seconds: int) -> bool:
    return (
        state.last_synced_at is not None
        and _utcnow() - state.last_synced_at < timedelta(seconds=cooldown_seconds)
    )


def _ensure_state_row(db: Session, scope: str, sync_key: str) -> None:
    exists = (
        db.query(LeetCodeSyncState.id)
        .filter_by(scope=scope, sync_key=sync_key)
        .first()
    )
    if exists:
        return

    db.add(LeetCodeSyncState(scope=scope, sync_key=sync_key))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def _locked_state(db: Session, scope: str, sync_key: str) -> LeetCodeSyncState:
    _ensure_state_row(db, scope, sync_key)
    return (
        db.query(LeetCodeSyncState)
        .filter_by(scope=scope, sync_key=sync_key)
        .with_for_update()
        .one()
    )


def _begin_sync(
    db: Session,
    scope: str,
    sync_key: str,
    *,
    cooldown_seconds: int,
    stale_seconds: int | None = None,
    require_metadata_key: str | None = None,
) -> tuple[bool, dict[str, Any]]:
    state = _locked_state(db, scope, sync_key)
    now = _utcnow()

    if (
        stale_seconds is not None
        and state.started_at is not None
        and now - state.started_at < timedelta(seconds=stale_seconds)
    ):
        meta = _state_meta("in_progress", state, cooldown_seconds)
        db.commit()
        return False, meta

    has_required_metadata = (
        require_metadata_key is None
        or isinstance(state.sync_metadata, dict)
        and require_metadata_key in state.sync_metadata
    )
    if _within_cooldown(state, cooldown_seconds) and has_required_metadata:
        meta = _state_meta("recently_synced", state, cooldown_seconds)
        db.commit()
        return False, meta

    state.status = "syncing"
    state.started_at = now
    state.error = None
    meta = _state_meta("syncing", state, cooldown_seconds)
    db.commit()
    return True, meta


def _finish_sync(
    db: Session,
    scope: str,
    sync_key: str,
    *,
    status: str,
    cooldown_seconds: int,
    error: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    state = _locked_state(db, scope, sync_key)
    state.status = status
    state.started_at = None
    state.error = error
    state.sync_metadata = metadata
    if status == "synced":
        state.last_synced_at = _utcnow()
    meta = _state_meta(status, state, cooldown_seconds, metadata=metadata)
    db.commit()
    return meta


def _session_factory_for(db: Session):
    return sessionmaker(
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        bind=db.get_bind(),
    )


async def _begin_user_recent(
    sync_key: str,
    db: Session,
    cooldown_seconds: int,
) -> tuple[bool, dict[str, Any]]:
    if db.bind and db.bind.dialect.name == "sqlite":
        return _begin_sync(
            db,
            "recent_submissions",
            sync_key,
            cooldown_seconds=cooldown_seconds,
            stale_seconds=LOBBY_SYNC_STALE_SECONDS,
        )

    session_factory = _session_factory_for(db)

    def begin() -> tuple[bool, dict[str, Any]]:
        local_db = session_factory()
        try:
            return _begin_sync(
                local_db,
                "recent_submissions",
                sync_key,
                cooldown_seconds=cooldown_seconds,
                stale_seconds=LOBBY_SYNC_STALE_SECONDS,
            )
        finally:
            local_db.close()

    return await asyncio.to_thread(begin)


async def _finish_user_recent(
    sync_key: str,
    db: Session,
    *,
    status: str,
    cooldown_seconds: int,
    error: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if db.bind and db.bind.dialect.name == "sqlite":
        return _finish_sync(
            db,
            "recent_submissions",
            sync_key,
            status=status,
            cooldown_seconds=cooldown_seconds,
            error=error,
            metadata=metadata,
        )

    session_factory = _session_factory_for(db)

    def finish() -> dict[str, Any]:
        local_db = session_factory()
        try:
            return _finish_sync(
                local_db,
                "recent_submissions",
                sync_key,
                status=status,
                cooldown_seconds=cooldown_seconds,
                error=error,
                metadata=metadata,
            )
        finally:
            local_db.close()

    return await asyncio.to_thread(finish)


async def fetch_user_recent_submissions(
    user: User,
    language: str,
    db: Session,
    *,
    limit: int = 50,
    cooldown_seconds: int = RECENT_SYNC_COOLDOWN_SECONDS,
) -> tuple[str, list[RecentAcceptedSubmission], dict[str, Any]]:
    if not is_leetcode_verified(user):
        return "skipped", [], {"status": "skipped", "reason": "not_verified"}

    user_id = user.id
    leetcode_username = user.leetcode_username
    sync_key = _user_key_for(user_id, leetcode_username)

    if not leetcode_username:
        return "skipped", [], {"status": "skipped", "reason": "not_verified"}

    can_sync, meta = await _begin_user_recent(sync_key, db, cooldown_seconds)
    if not can_sync:
        return meta["status"], [], meta

    try:
        submissions = await LeetCodeClient().get_recent_accepted_submissions(leetcode_username, limit=limit)
        filtered = filter_submissions_by_language(submissions, language)
        meta = await _finish_user_recent(
            sync_key,
            db,
            status="synced",
            cooldown_seconds=cooldown_seconds,
            metadata={"fetched": len(filtered)},
        )
        return "synced", filtered, meta
    except Exception as exc:
        logger.warning("LeetCode recent sync failed for %s: %s", leetcode_username, exc)
        meta = await _finish_user_recent(
            sync_key,
            db,
            status="failed",
            cooldown_seconds=cooldown_seconds,
            error=str(exc),
        )
        return "failed", [], meta


async def fetch_lobby_recent_submissions(
    players: list[tuple[Any, User]],
    language: str,
    db: Session,
    *,
    limit: int = 50,
    cooldown_seconds: int = RECENT_SYNC_COOLDOWN_SECONDS,
) -> tuple[dict[int, list[RecentAcceptedSubmission]], dict[str, Any]]:
    if db.bind and db.bind.dialect.name == "sqlite":
        results = [
            await fetch_user_recent_submissions(
                user, language, db, limit=limit, cooldown_seconds=cooldown_seconds,
            )
            for _, user in players
        ]
    else:
        results = await asyncio.gather(
            *[
                fetch_user_recent_submissions(
                    user, language, db, limit=limit, cooldown_seconds=cooldown_seconds,
                )
                for _, user in players
            ]
        )

    submissions_by_user: dict[int, list[RecentAcceptedSubmission]] = {}
    counts: dict[str, int] = {}
    fetched_submissions = 0
    for (_, user), (status, submissions, _) in zip(players, results):
        counts[status] = counts.get(status, 0) + 1
        if submissions:
            submissions_by_user[user.id] = submissions
            fetched_submissions += len(submissions)

    return submissions_by_user, {
        "status": "synced" if counts.get("synced") else "cached",
        "players": len(players),
        "counts": counts,
        "fetched_submissions": fetched_submissions,
    }


async def maybe_sync_user_daily_activity(
    user: User,
    db: Session,
    *,
    cooldown_seconds: int = PROFILE_SYNC_COOLDOWN_SECONDS,
) -> tuple[LeetCodeProfileResponse | None, list[RecentAcceptedSubmission], dict[str, Any]]:
    if not is_leetcode_verified(user):
        return None, [], {"status": "skipped", "reason": "not_verified"}

    user_id = user.id
    leetcode_username = user.leetcode_username
    if not leetcode_username:
        return None, [], {"status": "skipped", "reason": "not_verified"}

    sync_key = _user_key_for(user_id, leetcode_username)
    can_sync, meta = _begin_sync(
        db,
        "profile",
        sync_key,
        cooldown_seconds=cooldown_seconds,
        stale_seconds=LOBBY_SYNC_STALE_SECONDS,
        require_metadata_key="profile",
    )
    if not can_sync:
        db_state = (
            db.query(LeetCodeSyncState)
            .filter_by(scope="profile", sync_key=sync_key)
            .first()
        )
        profile = _cached_profile(db_state) if db_state else None
        return profile, [], meta

    try:
        profile, submissions = await sync_user_daily_activity_for_user(
            user_id,
            leetcode_username,
            db,
        )
    except Exception as exc:
        meta = _finish_sync(
            db,
            "profile",
            sync_key,
            status="failed",
            cooldown_seconds=cooldown_seconds,
            error=str(exc),
        )
        raise

    meta = _finish_sync(
        db,
        "profile",
        sync_key,
        status="synced",
        cooldown_seconds=cooldown_seconds,
        metadata={
            "profile": profile.model_dump(),
            "recent_submissions": len(submissions),
        },
    )
    return profile, submissions, meta


async def maybe_enter_lobby_sync(
    lobby_id: int,
    db: Session,
    *,
    cooldown_seconds: int = LOBBY_SYNC_COOLDOWN_SECONDS,
    stale_seconds: int = LOBBY_SYNC_STALE_SECONDS,
) -> tuple[bool, dict[str, Any]]:
    return _begin_sync(
        db,
        "lobby",
        str(lobby_id),
        cooldown_seconds=cooldown_seconds,
        stale_seconds=stale_seconds,
    )


def finish_lobby_sync(
    lobby_id: int,
    db: Session,
    *,
    status: str = "synced",
    error: str | None = None,
    cooldown_seconds: int = LOBBY_SYNC_COOLDOWN_SECONDS,
) -> dict[str, Any]:
    return _finish_sync(
        db,
        "lobby",
        str(lobby_id),
        status=status,
        cooldown_seconds=cooldown_seconds,
        error=error,
    )
