import asyncio

import pytest
from fastapi import HTTPException

from app.api.routes import lobby as lobby_routes
from app.models.lobby import Lobby
from app.models.lobby_player import LobbyPlayer
from app.models.user import User


def test_start_game_rolls_back_mode_failures(db, monkeypatch):
    user = User(google_sub="start-owner", email="start@example.test", display_name="Owner")
    db.add(user)
    db.flush()
    lobby = Lobby(
        creator_id=user.id,
        name="Start failure",
        status="waiting",
        game_mode="free_for_all",
        map_size="medium",
        max_players=2,
        faction_mode=False,
        faction_count=0,
        win_condition={"type": "points", "threshold": 100},
        left_player_ids=[],
    )
    db.add(lobby)
    db.flush()
    db.add(LobbyPlayer(lobby_id=lobby.id, user_id=user.id, faction_id=1, status="accepted"))
    db.commit()

    class BrokenMode:
        async def start(self, _lobby, _players, _db):
            raise RuntimeError("simulated schema failure")

    monkeypatch.setattr(lobby_routes, "catalog_has_minimum", lambda _db: True)
    monkeypatch.setattr(lobby_routes, "get_mode", lambda _slug: BrokenMode())

    with pytest.raises(HTTPException) as caught:
        asyncio.run(lobby_routes.start_game(lobby.id, user, db))

    assert caught.value.status_code == 500
    assert caught.value.detail == "Unable to initialize the game"
    db.expire_all()
    assert db.get(Lobby, lobby.id).status == "waiting"
