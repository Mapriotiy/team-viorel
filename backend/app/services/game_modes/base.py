"""Game-mode interface: each mode owns its board, sync rules, and win logic.

A mode implements three hooks driven by the lobby routes:
- start: create the board when the lobby launches.
- sync: pull submissions, apply the mode's rules, record events, evaluate
  the win condition, and return the full game-state payload.
- get_state: return the game-state payload without syncing.

Payloads are plain dicts (with pydantic models inside) so each mode can
shape its own response; every payload includes "game_mode", "status", and
"winner" for the frontend dispatch.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import ClassVar

from sqlalchemy.orm import Session

from app.models.lobby import Lobby
from app.models.lobby_event import LobbyEvent
from app.models.lobby_player import LobbyPlayer
from app.models.user import User

GAME_WON = "game_won"

Players = list[tuple[LobbyPlayer, User]]


def winner_info(lobby: Lobby, db: Session) -> dict | None:
    """Winner block for game-state payloads; None while the game runs.

    A finished lobby with neither winner_id nor winner_faction_id is a draw
    (label None).
    """
    from app.services.lobby_settings import lobby_factions

    if lobby.status != "finished":
        return None

    label: str | None = None
    if lobby.winner_id is not None:
        user = db.get(User, lobby.winner_id)
        label = user.leetcode_username if user else None
    elif lobby.winner_faction_id is not None:
        label = next(
            (f["name"] for f in lobby_factions(lobby) if f["id"] == lobby.winner_faction_id),
            f"Faction {lobby.winner_faction_id}",
        )

    return {
        "winner_user_id": lobby.winner_id,
        "winner_faction_id": lobby.winner_faction_id,
        "label": label,
    }


@dataclass
class WinnerResult:
    winner_user_id: int | None
    winner_faction_id: int | None
    reason: str


class GameMode(ABC):
    slugs: ClassVar[tuple[str, ...]]

    @abstractmethod
    async def start(self, lobby: Lobby, players: Players, db: Session) -> None:
        """Create the board for a launching lobby. Caller commits."""

    @abstractmethod
    async def sync(self, lobby: Lobby, players: Players, db: Session) -> dict:
        """Apply submissions, record events, evaluate the win condition."""

    @abstractmethod
    def get_state(self, lobby: Lobby, players: Players, db: Session) -> dict:
        """Current game-state payload, without syncing."""


def finish_lobby(
    lobby: Lobby,
    winner: WinnerResult,
    players: Players,
    db: Session,
) -> None:
    """Mark the lobby finished and log the game_won event. Caller commits."""
    lobby.status = "finished"
    lobby.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
    lobby.winner_id = winner.winner_user_id
    lobby.winner_faction_id = winner.winner_faction_id

    actor_id = winner.winner_user_id
    if actor_id is None and winner.winner_faction_id is not None:
        actor_id = next(
            (u.id for lp, u in players if lp.faction_id == winner.winner_faction_id),
            None,
        )
    if actor_id is None:
        return  # a draw has no game_won event

    username = next((u.leetcode_username for _, u in players if u.id == actor_id), "?")
    faction_id = next((lp.faction_id for lp, u in players if u.id == actor_id), None)
    db.add(
        LobbyEvent(
            lobby_id=lobby.id,
            province_id=None,
            event_type=GAME_WON,
            actor_user_id=actor_id,
            actor_username=username,
            actor_faction_id=faction_id if lobby.faction_mode else None,
            problem_title_slug=None,
        )
    )
