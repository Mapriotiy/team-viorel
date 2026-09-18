"""Pluggable game modes. Importing this package registers all built-in modes."""

from app.services.game_modes import bingo  # noqa: F401  (registers BingoMode)
from app.services.game_modes import territory  # noqa: F401  (registers TerritoryMode)
from app.services.game_modes.base import GAME_WON, GameMode, WinnerResult, finish_lobby, winner_info  # noqa: F401
from app.services.game_modes.registry import get_mode, known_modes, register  # noqa: F401
