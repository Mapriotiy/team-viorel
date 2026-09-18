"""Leave-lobby tracking and re-invite flow."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.lobby import Lobby
from app.models.lobby_player import LobbyPlayer
from app.models.user import User


def _make_client(tmp_path, users):
    engine = create_engine(f"sqlite:///{tmp_path / 'leave.db'}")
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)

    with TestSession() as session:
        session.add_all(users)
        session.commit()
        ids = {u.google_sub: u.id for u in users}

    return client, ids, TestSession


def test_leaving_tracks_player_and_reinvite_restores(tmp_path):
    host = User(google_sub="g-h", email="h@test.dev", display_name="Host")
    friend = User(google_sub="g-f", email="f@test.dev", display_name="Friend", leetcode_username="friend_lc")
    client, ids, TestSession = _make_client(tmp_path, [host, friend])

    with TestSession() as session:
        lobby = Lobby(
            creator_id=ids["g-h"],
            name="Lobby",
            status="waiting",
            game_mode="free_for_all",
            map_size="medium",
            max_players=2,
            faction_mode=False,
            faction_count=0,
            win_condition={"type": "points", "threshold": 5000},
        )
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-h"], faction_id=1, status="ready"))
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-f"], faction_id=1, status="ready"))
        session.commit()

    friend_headers = {"Authorization": f"Bearer {create_access_token(ids['g-f'])}"}
    host_headers = {"Authorization": f"Bearer {create_access_token(ids['g-h'])}"}

    res = client.delete(f"/api/lobbies/{lobby_id}/leave", headers=friend_headers)
    assert res.status_code == 204

    lobby_res = client.get(f"/api/lobbies/{lobby_id}", headers=host_headers)
    body = lobby_res.json()
    assert [p["user_id"] for p in body["players"]] == [ids["g-h"]]
    assert [p["user_id"] for p in body["left_players"]] == [ids["g-f"]]
    assert body["left_players"][0]["leetcode_username"] == "friend_lc"

    res = client.post(
        f"/api/lobbies/{lobby_id}/invite-user",
        json={"user_id": ids["g-f"]},
        headers=host_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert sorted(p["user_id"] for p in body["players"]) == sorted([ids["g-h"], ids["g-f"]])
    assert body["left_players"] == []

    app.dependency_overrides.clear()


def test_invite_user_with_chosen_faction(tmp_path):
    host = User(google_sub="g-h2", email="h2@test.dev", display_name="Host")
    friend = User(google_sub="g-f2", email="f2@test.dev", display_name="Friend", leetcode_username="friend2_lc")
    client, ids, TestSession = _make_client(tmp_path, [host, friend])

    with TestSession() as session:
        lobby = Lobby(
            creator_id=ids["g-h2"],
            name="Faction Lobby",
            status="waiting",
            game_mode="team_battle",
            map_size="medium",
            max_players=0,
            faction_mode=True,
            faction_count=2,
            win_condition={"type": "points", "threshold": 5000},
        )
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-h2"], faction_id=2, status="ready"))
        session.commit()

    host_headers = {"Authorization": f"Bearer {create_access_token(ids['g-h2'])}"}

    res = client.post(
        f"/api/lobbies/{lobby_id}/invite-user",
        json={"user_id": ids["g-f2"], "faction_id": 1},
        headers=host_headers,
    )
    assert res.status_code == 200
    body = res.json()
    added = next(p for p in body["players"] if p["user_id"] == ids["g-f2"])
    assert added["faction_id"] == 1

    app.dependency_overrides.clear()
