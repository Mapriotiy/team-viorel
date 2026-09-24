from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.models.lobby import Lobby
from app.models.lobby_player import LobbyPlayer


def _make_client(tmp_path, users):
    engine = create_engine(f"sqlite:///{tmp_path / 'admin.db'}")
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


def _lobby(creator_id: int, name: str, status: str) -> Lobby:
    return Lobby(
        creator_id=creator_id,
        name=name,
        status=status,
        game_mode="free_for_all",
        map_size="medium",
        max_players=2,
        faction_mode=False,
        faction_count=0,
        win_condition={"type": "territory_control", "threshold": 0.5, "duration_hours": 0},
    )


def test_non_admin_cannot_access_admin_users(tmp_path):
    regular = User(google_sub="g1", email="u@test.dev", display_name="User")
    client, ids, _ = _make_client(tmp_path, [regular])
    token = create_access_token(ids["g1"])

    res = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 403
    assert res.json()["detail"] == "Admin privileges required"
    app.dependency_overrides.clear()


def test_admin_lists_and_searches_users(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    alice = User(google_sub="g-alice", email="alice@test.dev", display_name="Alice")
    bob = User(google_sub="g-bob", email="bob@test.dev", display_name="Bob", leetcode_username="bob-lc")
    client, ids, _ = _make_client(tmp_path, [admin, alice, bob])
    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.get("/api/admin/users", headers=headers)
    assert res.status_code == 200
    assert res.json()["total"] == 3

    res = client.get("/api/admin/users", params={"q": "bob"}, headers=headers)
    assert res.status_code == 200
    users = res.json()["users"]
    assert len(users) == 1
    assert users[0]["id"] == ids["g-bob"]

    res = client.get("/api/admin/users", params={"q": str(ids["g-alice"])}, headers=headers)
    assert res.status_code == 200
    assert res.json()["total"] == 1
    assert res.json()["users"][0]["id"] == ids["g-alice"]
    app.dependency_overrides.clear()


def test_admin_can_ban_and_unban(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    target = User(google_sub="g-target", email="t@test.dev", display_name="Target")
    client, ids, _ = _make_client(tmp_path, [admin, target])
    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.patch(f"/api/admin/users/{ids['g-target']}", json={"is_banned": True}, headers=headers)
    assert res.status_code == 200
    assert res.json()["is_banned"] is True

    banned_headers = {"Authorization": f"Bearer {create_access_token(ids['g-target'])}"}
    me = client.get("/api/auth/me", headers=banned_headers)
    assert me.status_code == 403
    assert me.json()["detail"] == "Account suspended"

    res = client.patch(f"/api/admin/users/{ids['g-target']}", json={"is_banned": False}, headers=headers)
    assert res.status_code == 200
    assert client.get("/api/auth/me", headers=banned_headers).status_code == 200
    app.dependency_overrides.clear()


def test_admin_cannot_modify_self(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    client, ids, _ = _make_client(tmp_path, [admin])
    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.patch(f"/api/admin/users/{ids['g-admin']}", json={"is_admin": False}, headers=headers)

    assert res.status_code == 400
    assert res.json()["detail"] == "You cannot modify your own account"
    app.dependency_overrides.clear()


def test_can_demote_second_admin_but_not_last(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    other = User(google_sub="g-other", email="o@test.dev", display_name="Other", is_admin=True)
    client, ids, _ = _make_client(tmp_path, [admin, other])
    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.patch(f"/api/admin/users/{ids['g-other']}", json={"is_admin": False}, headers=headers)
    assert res.status_code == 200
    assert res.json()["is_admin"] is False
    app.dependency_overrides.clear()


def test_reset_leetcode_clears_link(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    target = User(
        google_sub="g-target",
        email="t@test.dev",
        display_name="Target",
        leetcode_username="someuser",
        leetcode_verified_at=datetime(2026, 1, 1),
    )
    client, ids, _ = _make_client(tmp_path, [admin, target])
    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.post(f"/api/admin/users/{ids['g-target']}/reset-leetcode", headers=headers)

    assert res.status_code == 200
    assert res.json()["leetcode_username"] is None
    assert res.json()["leetcode_verified_at"] is None
    app.dependency_overrides.clear()


def test_admin_stats(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    banned = User(google_sub="g-u1", email="u1@test.dev", display_name="U1", is_banned=True)
    client, ids, TestSession = _make_client(tmp_path, [admin, banned])
    with TestSession() as session:
        session.add_all([
            _lobby(ids["g-admin"], "Live", "active"),
            _lobby(ids["g-admin"], "Queue", "waiting"),
        ])
        session.commit()

    res = client.get("/api/admin/stats", headers={"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"})

    assert res.status_code == 200
    data = res.json()
    assert data["total_users"] == 2
    assert data["banned_users"] == 1
    assert data["admin_users"] == 1
    assert data["active_lobbies"] == 1
    assert data["waiting_lobbies"] == 1
    assert data["finished_lobbies"] == 0
    assert data["problem_count"] == 0
    assert data["dau_today"] == 0
    assert len(data["dau_series"]) == 7
    app.dependency_overrides.clear()


def test_dau_tracking_via_me_and_stats(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    client, ids, _ = _make_client(tmp_path, [admin])
    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200

    stats = client.get("/api/admin/stats", headers=headers).json()
    assert stats["dau_today"] == 1
    assert stats["dau_7d"] == 1
    assert stats["solvers_today"] == 0
    assert len(stats["dau_series"]) == 7
    assert any(day["active"] == 1 for day in stats["dau_series"])
    app.dependency_overrides.clear()


def test_admin_lists_lobbies_and_filters(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    client, ids, TestSession = _make_client(tmp_path, [admin])

    with TestSession() as session:
        session.add_all([
            _lobby(ids["g-admin"], "Match One", "active"),
            _lobby(ids["g-admin"], "Match Two", "waiting"),
        ])
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.get("/api/admin/lobbies", headers=headers)
    assert res.status_code == 200
    assert res.json()["total"] == 2

    res = client.get("/api/admin/lobbies", params={"status": "active"}, headers=headers)
    assert res.status_code == 200
    lobbies = res.json()["lobbies"]
    assert len(lobbies) == 1
    assert lobbies[0]["status"] == "active"

    res = client.get("/api/admin/lobbies", params={"q": "Two"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["total"] == 1
    app.dependency_overrides.clear()


def test_force_end_lobby(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    client, ids, TestSession = _make_client(tmp_path, [admin])

    with TestSession() as session:
        session.add(_lobby(ids["g-admin"], "Stuck", "active"))
        session.commit()
        lobby_id = session.query(Lobby).filter_by(name="Stuck").scalar().id

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.post(f"/api/admin/lobbies/{lobby_id}/force-end", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "finished"
    assert res.json()["finished_at"] is not None

    again = client.post(f"/api/admin/lobbies/{lobby_id}/force-end", headers=headers)
    assert again.status_code == 409
    app.dependency_overrides.clear()


def test_admin_delete_lobby(tmp_path):
    admin = User(google_sub="g-admin", email="a@test.dev", display_name="Admin", is_admin=True)
    player = User(google_sub="g-p1", email="p1@test.dev", display_name="P1")
    client, ids, TestSession = _make_client(tmp_path, [admin, player])

    with TestSession() as session:
        session.add_all([_lobby(ids["g-admin"], "Doomed", "waiting")])
        session.commit()
        lobby_id = session.query(Lobby).filter_by(name="Doomed").scalar().id
        session.add(LobbyPlayer(lobby_id=lobby_id, user_id=ids["g-p1"], status="accepted"))
        session.commit()

    headers = {"Authorization": f"Bearer {create_access_token(ids['g-admin'])}"}

    res = client.delete(f"/api/admin/lobbies/{lobby_id}", headers=headers)
    assert res.status_code == 204

    res = client.delete(f"/api/admin/lobbies/{lobby_id}", headers=headers)
    assert res.status_code == 404
    app.dependency_overrides.clear()
