from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.lobby import Lobby
from app.models.lobby_map import LobbyMap
from app.models.lobby_map_province import LobbyMapProvince
from app.models.lobby_player import LobbyPlayer
from app.models.user import User


def _make_client(tmp_path, users):
    engine = create_engine(f"sqlite:///{tmp_path / 'debug.db'}")
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


def _lobby(creator_id: int, name: str = "Debug") -> Lobby:
    return Lobby(
        creator_id=creator_id,
        name=name,
        status="active",
        game_mode="free_for_all",
        map_size="medium",
        max_players=2,
        faction_mode=False,
        faction_count=0,
        win_condition={"type": "territory_control", "threshold": 0.5, "duration_hours": 0},
    )


def _seed_map(session, lobby_id: int) -> int:
    map_row = LobbyMap(lobby_id=lobby_id, map_size="medium", map_kind="default")
    session.add(map_row)
    session.commit()
    session.add(
        LobbyMapProvince(
            lobby_map_id=map_row.id,
            province_id="p1",
            region_id="r1",
            province_name="Province One",
            problem_title_slug="two-sum",
        )
    )
    session.commit()
    return map_row.id


def test_non_admin_cannot_use_debug_tools(tmp_path):
    regular = User(google_sub="g1", email="u@test.dev", display_name="User")
    client, ids, TestSession = _make_client(tmp_path, [regular])

    with TestSession() as session:
        lobby = _lobby(ids["g1"])
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g1"], status="accepted"))
        _seed_map(session, lobby_id)
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g1'])}"}

    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/powerups",
        json={"user_id": ids["g1"], "reroll": 1},
        headers=headers,
    )
    assert res.status_code == 403

    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/provinces/p1/capture",
        json={"user_id": ids["g1"]},
        headers=headers,
    )
    assert res.status_code == 403
    app.dependency_overrides.clear()


def test_admin_grants_powerups(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    player = User(google_sub="g-p1", email="p1@test.dev", display_name="P1")
    client, ids, TestSession = _make_client(tmp_path, [admin, player])

    with TestSession() as session:
        lobby = _lobby(ids["g-admin"])
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-p1"], status="accepted"))
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}
    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/powerups",
        json={"user_id": ids["g-p1"], "reroll": 3, "fortify": 1},
        headers=headers,
    )

    assert res.status_code == 200
    assert res.json()["powerups"] == {"reroll": 3, "fortify": 1, "siege": 0}
    app.dependency_overrides.clear()


def test_admin_capture_and_uncapture_province(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    player = User(google_sub="g-p1", email="p1@test.dev", display_name="P1", leetcode_username="p1lc")
    client, ids, TestSession = _make_client(tmp_path, [admin, player])

    with TestSession() as session:
        lobby = _lobby(ids["g-admin"])
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-p1"], status="accepted"))
        _seed_map(session, lobby_id)
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/provinces/p1/capture",
        json={"user_id": ids["g-p1"], "runtime_ms": 42},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["captured_by"] == ids["g-p1"]
    assert res.json()["captured_runtime_ms"] == 42
    assert res.json()["capturer_leetcode_username"] == "p1lc"

    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/provinces/p1/uncapture",
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["captured_by"] is None
    assert res.json()["captured_runtime_ms"] is None
    app.dependency_overrides.clear()


def test_debug_province_not_found(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    client, ids, TestSession = _make_client(tmp_path, [admin])

    with TestSession() as session:
        lobby = _lobby(ids["g-admin"])
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        _seed_map(session, lobby_id)
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}
    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/provinces/nope/capture",
        json={"user_id": ids["g-admin"]},
        headers=headers,
    )
    assert res.status_code == 404
    app.dependency_overrides.clear()


def test_debug_capture_can_finish_game(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True, leetcode_username="adminlc")
    player = User(google_sub="g-p1", email="p1@test.dev", display_name="P1", leetcode_username="p1lc")
    client, ids, TestSession = _make_client(tmp_path, [admin, player])

    with TestSession() as session:
        lobby = Lobby(
            creator_id=ids["g-admin"],
            name="Win",
            status="active",
            game_mode="free_for_all",
            map_size="medium",
            max_players=2,
            faction_mode=False,
            faction_count=0,
            win_condition={"type": "territory_control", "threshold": 0.5, "duration_hours": 0},
        )
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-admin"], status="accepted"))
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-p1"], status="accepted"))
        session.commit()

        map_row = LobbyMap(lobby_id=lobby_id, map_size="medium", map_kind="default")
        session.add(map_row)
        session.commit()
        for index in range(4):
            session.add(
                LobbyMapProvince(
                    lobby_map_id=map_row.id,
                    province_id=f"p{index}",
                    region_id="r1",
                    problem_title_slug="two-sum",
                    order_index=index,
                )
            )
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    # 2 of 4 provinces crosses the 0.5 threshold -> game should finish.
    for index in range(2):
        res = client.post(
            f"/api/admin/debug/lobbies/{lobby_id}/provinces/p{index}/capture",
            json={"user_id": ids["g-p1"]},
            headers=headers,
        )
        assert res.status_code == 200

    state = client.get(f"/api/lobbies/{lobby_id}/map", headers=headers).json()
    assert state["status"] == "finished"
    assert state["winner"]["winner_user_id"] == ids["g-p1"]
    app.dependency_overrides.clear()


def test_debug_force_win_and_draw(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True, leetcode_username="adminlc")
    player = User(google_sub="g-p1", email="p1@test.dev", display_name="P1", leetcode_username="p1lc")
    client, ids, TestSession = _make_client(tmp_path, [admin, player])

    with TestSession() as session:
        lobby = Lobby(
            creator_id=ids["g-admin"],
            name="Finish",
            status="active",
            game_mode="free_for_all",
            map_size="medium",
            max_players=2,
            faction_mode=False,
            faction_count=0,
            win_condition={"type": "territory_control", "threshold": 0.5, "duration_hours": 0},
        )
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-admin"], status="accepted"))
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-p1"], status="accepted"))
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    # Force a win for the player.
    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/finish",
        json={"winner_user_id": ids["g-p1"]},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "finished"
    assert res.json()["winner_user_id"] == ids["g-p1"]

    state = client.get(f"/api/lobbies/{lobby_id}/map", headers=headers).json()
    assert state["status"] == "finished"
    assert state["winner"]["winner_user_id"] == ids["g-p1"]

    # Already finished -> 409.
    again = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/finish",
        json={"winner_user_id": ids["g-p1"]},
        headers=headers,
    )
    assert again.status_code == 409
    app.dependency_overrides.clear()


def test_debug_force_draw(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True, leetcode_username="adminlc")
    player = User(google_sub="g-p1", email="p1@test.dev", display_name="P1", leetcode_username="p1lc")
    client, ids, TestSession = _make_client(tmp_path, [admin, player])

    with TestSession() as session:
        lobby = Lobby(
            creator_id=ids["g-admin"],
            name="Draw",
            status="active",
            game_mode="free_for_all",
            map_size="medium",
            max_players=2,
            faction_mode=False,
            faction_count=0,
            win_condition={"type": "territory_control", "threshold": 0.5, "duration_hours": 0},
        )
        session.add(lobby)
        session.commit()
        lobby_id = lobby.id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-admin"], status="accepted"))
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.post(
        f"/api/admin/debug/lobbies/{lobby_id}/finish",
        json={"winner_user_id": None, "winner_faction_id": None},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.json()["status"] == "finished"
    assert res.json()["winner_user_id"] is None

    state = client.get(f"/api/lobbies/{lobby_id}/map", headers=headers).json()
    assert state["status"] == "finished"
    assert state["winner"]["winner_user_id"] is None
    assert state["winner"]["winner_faction_id"] is None
    assert state["winner"]["label"] is None
    app.dependency_overrides.clear()
