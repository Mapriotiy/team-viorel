"""DEPRECATED: weekly friendship map events and feed.

Lobbies are the only active game surface; this router is no longer
registered in app.api.router. Lobby events are served from
GET /lobbies/{lobby_id}/events instead. The map_events table and model are
kept dormant so historical data survives until a full removal.
"""

from fastapi import APIRouter

router = APIRouter()
