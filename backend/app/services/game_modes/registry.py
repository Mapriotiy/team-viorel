"""Registry mapping lobby.game_mode slugs to GameMode implementations."""

from fastapi import HTTPException

from app.services.game_modes.base import GameMode

_MODES: dict[str, GameMode] = {}


def register(mode: GameMode) -> None:
    for slug in mode.slugs:
        _MODES[slug] = mode


def get_mode(slug: str) -> GameMode:
    mode = _MODES.get(slug)
    if mode is None:
        raise HTTPException(400, f"Unknown game mode: {slug}")
    return mode


def known_modes() -> list[str]:
    return sorted(_MODES)
