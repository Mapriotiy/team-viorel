"""DEPRECATED: weekly friendship maps.

Lobbies are the only active game surface; this router is no longer
registered in app.api.router. The weekly_map* tables and their models are
kept dormant so historical data survives until a full removal.
"""

from fastapi import APIRouter

router = APIRouter()
