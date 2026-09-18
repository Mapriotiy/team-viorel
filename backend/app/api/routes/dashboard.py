import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.daily_activity import DailyActivity
from app.models.friendship import Friendship
from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby import Lobby
from app.models.lobby_event import LobbyEvent
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.models.user_solved import UserSolved
from app.schemas.dashboard import (
    DashboardFactionResponse,
    DashboardLobbyPlayerResponse,
    DashboardLobbyResponse,
    DashboardResponse,
    PlayerStatsResponse,
    TodaySubmissionResponse,
)
from app.schemas.friends import (
    FriendResponse,
    FriendStreakResponse,
    FriendUserResponse,
    TodayFriendStatusResponse,
)
from app.services.streaks import (
    calculate_longest_streak,
    calculate_personal_streak,
    calculate_friend_streak,
)
from app.services.activity_sync import (
    get_utc_today,
)
from app.services.leetcode_sync import get_cached_user_profile, sync_user_daily_activity_by_id
from app.services.activity_tracking import record_user_activity
from sqlalchemy import func, or_

router = APIRouter()

FACTION_COLORS = {1: "#2f80ed", 2: "#eb5757", 3: "#f2994a", 4: "#27ae60"}
FACTION_NAMES = {1: "Alpha", 2: "Bravo", 3: "Charlie", 4: "Delta"}
ALLOWED_FACTION_COLORS = {
    "#2f80ed", "#eb5757", "#f2994a", "#27ae60",
    "#9b51e0", "#c7429b", "#c86f3c", "#00b5ad",
}


def build_lobby_factions(lobby: Lobby) -> list[DashboardFactionResponse]:
    if not lobby.faction_mode or lobby.faction_count <= 0:
        return []

    configured = (lobby.win_condition or {}).get("factions")
    configured_by_id = {
        int(faction.get("id")): faction
        for faction in configured or []
        if isinstance(faction, dict) and faction.get("id")
    }

    factions: list[DashboardFactionResponse] = []
    for faction_id in range(1, lobby.faction_count + 1):
        configured_faction = configured_by_id.get(faction_id, {})
        configured_color = str(configured_faction.get("color") or FACTION_COLORS.get(faction_id, "#888888"))
        factions.append(
            DashboardFactionResponse(
                id=faction_id,
                name=str(configured_faction.get("name") or FACTION_NAMES.get(faction_id, f"Faction {faction_id}"))[:32],
                color=configured_color if configured_color in ALLOWED_FACTION_COLORS else FACTION_COLORS.get(faction_id, "#888888"),
            )
        )
    return factions


def build_activity_calendar(
        current_user: User,
        db: Session,
        today: date,
        days: int = 366,
) -> list[dict]:
    start_date = today - timedelta(days=days - 1)

    rows = (
        db.query(DailyActivity.date, DailyActivity.submissions_count)
        .filter(
            DailyActivity.user_id == current_user.id,
            DailyActivity.date >= start_date,
            DailyActivity.date <= today,
        )
        .all()
    )

    counts_by_date = {row.date: row.submissions_count for row in rows}

    return [
        {
            "date": (start_date + timedelta(days=offset)).isoformat(),
            "count": counts_by_date.get(start_date + timedelta(days=offset), 0),
        }
        for offset in range(days)
    ]


def build_user_lobbies(current_user: User, db: Session, include_finished: bool = False) -> list[DashboardLobbyResponse]:
    memberships = (
        db.query(LobbyPlayer, Lobby)
        .join(Lobby, LobbyPlayer.lobby_id == Lobby.id)
        .filter(
            LobbyPlayer.user_id == current_user.id,
            Lobby.status == "finished" if include_finished else Lobby.status != "finished",
        )
        .order_by(Lobby.created_at.desc())
        .all()
    )

    lobby_ids = [lobby.id for _, lobby in memberships]
    player_rows_by_lobby: dict[int, list[tuple[LobbyPlayer, User]]] = {lobby_id: [] for lobby_id in lobby_ids}
    if lobby_ids:
        player_rows = (
            db.query(LobbyPlayer, User)
            .join(User, LobbyPlayer.user_id == User.id)
            .filter(LobbyPlayer.lobby_id.in_(lobby_ids))
            .all()
        )
        for player, user in player_rows:
            player_rows_by_lobby.setdefault(player.lobby_id, []).append((player, user))

    responses: list[DashboardLobbyResponse] = []
    changed = False
    for _, lobby in memberships:
        player_rows = player_rows_by_lobby.get(lobby.id, [])
        if include_finished and lobby.replay_token is None:
            lobby.replay_token = secrets.token_urlsafe(32)
            changed = True
        responses.append(
            DashboardLobbyResponse(
                id=lobby.id,
                name=lobby.name,
                status=lobby.status,
                game_mode=lobby.game_mode,
                map_size=lobby.map_size,
                max_players=lobby.max_players,
                faction_mode=lobby.faction_mode,
                faction_count=lobby.faction_count,
                factions=build_lobby_factions(lobby),
                programming_language=str((lobby.win_condition or {}).get("programming_language") or "python3"),
                creator_id=lobby.creator_id,
                players=[
                    DashboardLobbyPlayerResponse(
                        user_id=user.id,
                        leetcode_username=user.leetcode_username,
                        faction_id=player.faction_id,
                        status=player.status,
                    )
                    for player, user in player_rows
                ],
                winner_id=lobby.winner_id,
                winner_faction_id=lobby.winner_faction_id,
                finished_at=lobby.finished_at,
                replay_token=lobby.replay_token,
            )
        )
    if changed:
        db.commit()
    return responses


def get_active_dates_by_user_ids(user_ids: list[int], db: Session) -> dict[int, set[date]]:
    if not user_ids:
        return {}
    result = {user_id: set() for user_id in user_ids}
    rows = (
        db.query(DailyActivity.user_id, DailyActivity.date)
        .filter(
            DailyActivity.user_id.in_(user_ids),
            DailyActivity.submissions_count > 0,
        )
        .all()
    )
    for user_id, activity_date in rows:
        result.setdefault(user_id, set()).add(activity_date)
    return result


def build_friends(
    current_user: User,
    db: Session,
    active_dates_by_user_id: dict[int, set[date]],
    today: date,
    friendships,
    friend_ids: list[int],
) -> tuple[list[FriendResponse], list[int]]:
    friends = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(friend_ids)).all()
    } if friend_ids else {}

    current_user_dates = active_dates_by_user_id.get(current_user.id, set())
    responses: list[FriendResponse] = []
    for friendship in friendships:
        friend_id = friendship.user_b_id if friendship.user_a_id == current_user.id else friendship.user_a_id
        friend = friends.get(friend_id)
        if friend is None:
            continue

        streak = calculate_friend_streak(
            user_dates=current_user_dates,
            friend_dates=active_dates_by_user_id.get(friend.id, set()),
            start_date=friendship.created_at.date(),
            today=today,
        )
        responses.append(
            FriendResponse(
                friendship_id=friendship.id,
                friend=FriendUserResponse(id=friend.id, leetcode_username=friend.leetcode_username),
                streak=FriendStreakResponse(
                    display_count=streak.display_count,
                    current_count=streak.current_count,
                    longest_count=streak.longest_count,
                    state=streak.state,
                    last_shared_active_date=streak.last_shared_active_date,
                    started_at=streak.started_at,
                    today=TodayFriendStatusResponse(
                        you_active=streak.today.you_active,
                        friend_active=streak.today.friend_active,
                        shared_active=streak.today.shared_active,
                    ),
                ),
            )
        )

    return responses, friend_ids


def build_player_stats(current_user: User, db: Session) -> PlayerStatsResponse:
    member_lobby_ids = [
        row[0]
        for row in db.query(LobbyPlayer.lobby_id)
        .filter(LobbyPlayer.user_id == current_user.id)
        .all()
    ]

    games_played = 0
    games_won = 0
    if member_lobby_ids:
        finished = (
            db.query(Lobby, LobbyPlayer.faction_id)
            .join(LobbyPlayer, LobbyPlayer.lobby_id == Lobby.id)
            .filter(
                Lobby.id.in_(member_lobby_ids),
                Lobby.status == "finished",
            )
            .all()
        )
        games_played = len(finished)
        for lobby, faction_id in finished:
            if lobby.winner_id is not None and lobby.winner_id == current_user.id:
                games_won += 1
            elif (
                lobby.faction_mode
                and lobby.winner_faction_id is not None
                and lobby.winner_faction_id == faction_id
            ):
                games_won += 1

    total_captures = (
        db.query(func.count(LobbyEvent.id))
        .filter(
            LobbyEvent.actor_user_id == current_user.id,
            LobbyEvent.event_type == "capture",
        )
        .scalar()
        or 0
    )

    return PlayerStatsResponse(
        games_played=games_played,
        games_won=games_won,
        win_rate=round(games_won / games_played * 100, 1) if games_played else 0.0,
        total_captures=total_captures,
    )


def build_today_submissions(current_user: User, db: Session, today: date) -> list[TodaySubmissionResponse]:
    start = datetime.combine(today, datetime.min.time())
    end = start + timedelta(days=1)
    solved_rows = (
        db.query(UserSolved)
        .filter(
            UserSolved.user_id == current_user.id,
            UserSolved.solved_at >= start,
            UserSolved.solved_at < end,
        )
        .order_by(UserSolved.solved_at.desc())
        .all()
    )
    if not solved_rows:
        return []

    problems = {
        p.title_slug: p
        for p in db.query(LeetCodeProblem).filter(
            LeetCodeProblem.title_slug.in_([row.title_slug for row in solved_rows])
        ).all()
    }

    seen: set[str] = set()
    submissions: list[TodaySubmissionResponse] = []
    for row in solved_rows:
        if row.title_slug in seen:
            continue
        seen.add(row.title_slug)
        problem = problems.get(row.title_slug)
        submissions.append(
            TodaySubmissionResponse(
                title=problem.title if problem else row.title_slug,
                title_slug=row.title_slug,
                url=f"https://leetcode.com/problems/{row.title_slug}/",
                submitted_at=row.solved_at.replace(tzinfo=timezone.utc).isoformat(),
                language=row.language,
                difficulty=problem.difficulty if problem else None,
                topic_tags=(problem.topic_tags or [])[:2] if problem else [],
            )
        )
    return submissions


@router.get("/", response_model=DashboardResponse)
async def get_dashboard(
        background_tasks: BackgroundTasks,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
):
    cached_profile = get_cached_user_profile(current_user, db)
    avatar_url = cached_profile.avatar_url if cached_profile else None
    today = get_utc_today()

    today_submissions = build_today_submissions(current_user, db, today)

    friendships = (
        db.query(Friendship)
        .filter(
            or_(
                Friendship.user_a_id == current_user.id,
                Friendship.user_b_id == current_user.id,
            )
        )
        .all()
    )
    friend_ids = [
        friendship.user_b_id if friendship.user_a_id == current_user.id else friendship.user_a_id
        for friendship in friendships
    ]
    active_dates_by_user_id = get_active_dates_by_user_ids([current_user.id, *friend_ids], db)
    active_dates = active_dates_by_user_id.get(current_user.id, set())
    personal_streak = calculate_personal_streak(active_dates, today=today)
    friends, friend_ids = build_friends(
        current_user,
        db,
        active_dates_by_user_id,
        today,
        friendships,
        friend_ids,
    )

    background_tasks.add_task(sync_user_daily_activity_by_id, current_user.id)
    for friend_id in friend_ids:
        background_tasks.add_task(sync_user_daily_activity_by_id, friend_id)

    record_user_activity(current_user.id, db)

    return DashboardResponse(
        leetcode_username=current_user.leetcode_username,
        display_name=current_user.display_name,
        avatar_url=avatar_url or current_user.avatar_url,
        leetcode_verified_at=current_user.leetcode_verified_at,
        current_streak=personal_streak.display_count,
        current_streak_state=personal_streak.state,
        today_active=personal_streak.today_active,
        longest_streak=calculate_longest_streak(active_dates),
        active_days_count=len(active_dates),
        today_submissions=today_submissions,
        activity_calendar=build_activity_calendar(current_user, db, today=today),
        lobbies=build_user_lobbies(current_user, db),
        friends=friends,
        stats=build_player_stats(current_user, db),
    )


@router.get("/history", response_model=list[DashboardLobbyResponse])
def get_lobby_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_user_lobbies(current_user, db, include_finished=True)
