"""Shared lobby configuration helpers used by routes and game modes."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.lobby import Lobby
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.services.user_solved import normalize_language

FACTION_COLORS = {1: "#2f80ed", 2: "#eb5757", 3: "#f2994a", 4: "#27ae60"}
FACTION_NAMES = {1: "Alpha", 2: "Bravo", 3: "Charlie", 4: "Delta"}
ALLOWED_FACTION_COLORS = {
    "#2f80ed", "#eb5757", "#f2994a", "#27ae60",
    "#9b51e0", "#c7429b", "#c86f3c", "#00b5ad",
}
ALLOWED_PROGRAMMING_LANGUAGES = {
    "python3", "cpp", "java", "javascript", "typescript", "csharp", "golang", "rust",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def default_factions(count: int) -> list[dict]:
    return [
        {
            "id": faction_id,
            "name": FACTION_NAMES.get(faction_id, f"Faction {faction_id}"),
            "color": FACTION_COLORS.get(faction_id, "#888888"),
        }
        for faction_id in range(1, count + 1)
    ]


def lobby_factions(lobby: Lobby) -> list[dict]:
    if not lobby.faction_mode or lobby.faction_count <= 0:
        return []

    configured = (lobby.win_condition or {}).get("factions")
    configured_by_id = {
        int(faction.get("id")): faction
        for faction in configured or []
        if isinstance(faction, dict) and faction.get("id")
    }

    factions: list[dict] = []
    for default in default_factions(lobby.faction_count):
        configured_faction = configured_by_id.get(default["id"], {})
        configured_color = str(configured_faction.get("color") or default["color"])
        factions.append(
            {
                "id": default["id"],
                "name": str(configured_faction.get("name") or default["name"])[:32],
                "color": configured_color if configured_color in ALLOWED_FACTION_COLORS else default["color"],
            }
        )
    return factions


def set_lobby_factions(lobby: Lobby, factions: list[dict]) -> None:
    win_condition = dict(lobby.win_condition or {})
    win_condition["factions"] = factions
    lobby.win_condition = win_condition


def lobby_programming_language(lobby: Lobby) -> str:
    language = normalize_language(str((lobby.win_condition or {}).get("programming_language") or "python3"))
    return language if language in ALLOWED_PROGRAMMING_LANGUAGES else "python3"


def filter_submissions_by_language(submissions, language: str):
    return [
        submission
        for submission in submissions
        if normalize_language(submission.language) == language
    ]


def ordered_players(lobby_id: int, db: Session) -> list[tuple[LobbyPlayer, User]]:
    """Lobby players with users, in join order (the capture tiebreak order)."""
    return (
        db.query(LobbyPlayer, User)
        .join(User, LobbyPlayer.user_id == User.id)
        .filter(LobbyPlayer.lobby_id == lobby_id)
        .order_by(LobbyPlayer.joined_at.asc(), LobbyPlayer.user_id.asc())
        .all()
    )


def team_by_user(lobby: Lobby, players: list[tuple[LobbyPlayer, User]]) -> dict[int, int]:
    """Capture/scoring team per player: faction in faction mode, self otherwise."""
    if lobby.faction_mode:
        return {u.id: lp.faction_id for lp, u in players if lp.faction_id}
    return {u.id: u.id for _, u in players}
