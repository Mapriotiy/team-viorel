"""Server-side lobby map thumbnail rendering."""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.lobby import Lobby
from app.models.lobby_map import LobbyMap
from app.models.lobby_map_province import LobbyMapProvince
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.services.map_config import PROVINCE_REGION, build_default_map_draft
from app.services.map_thumbnail import render_lobby_map_thumbnail


@pytest.fixture()
def seeded_lobby(db):
    user = User(id=1, leetcode_username="alice", leetcode_verified_at=datetime(2026, 7, 27, 12, 0))
    db.add(user)
    lobby = Lobby(
        creator_id=1,
        name="thumb",
        status="active",
        game_mode="free_for_all",
        map_size="medium",
        max_players=2,
        faction_mode=False,
        faction_count=0,
        win_condition={"type": "territory_control", "threshold": 0.5},
    )
    db.add(lobby)
    db.flush()

    lmap = LobbyMap(
        lobby_id=lobby.id,
        map_size="medium",
        map_kind="generated",
        map_config={"kind": "generated", "draft": build_default_map_draft()},
    )
    db.add(lmap)
    db.flush()

    for idx, (province_id, region_id) in enumerate(PROVINCE_REGION.items()):
        db.add(
            LobbyMapProvince(
                lobby_map_id=lmap.id,
                province_id=province_id,
                region_id=region_id,
                topic_id=region_id,
                order_index=idx,
                problem_title_slug="two-sum",
            )
        )
    db.add(LobbyPlayer(lobby_id=lobby.id, user_id=1, faction_id=1, status="ready"))
    db.commit()
    return lobby, lmap


def test_renders_default_map_thumbnail(db, seeded_lobby):
    lobby, lmap = seeded_lobby

    # Capture two provinces.
    rows = (
        db.query(LobbyMapProvince)
        .filter_by(lobby_map_id=lmap.id)
        .order_by(LobbyMapProvince.order_index.asc())
        .all()
    )
    rows[0].captured_by = 1
    rows[1].captured_by = 1
    db.commit()

    png = render_lobby_map_thumbnail(lobby.id, width=320, db=db)
    assert png
    assert png[:8] == b"\x89PNG\r\n\x1a\n"

    webp = render_lobby_map_thumbnail(lobby.id, width=200, fmt="webp", quality=70, db=db)
    assert webp
    assert webp[:4] == b"RIFF"

    missing = render_lobby_map_thumbnail(99999, db=db)
    assert missing is None


def test_renders_multi_island_generated_map(db):
    # Two islands that reuse the same piece asset but carry their own
    # per-island pathIndex (0..n). The global mapping would overwrite island 2;
    # the per-island filter must keep them distinct.
    draft = {
        "schemaVersion": 1,
        "id": "multi",
        "size": "small",
        "seaBaseSrc": "maps/leet_background.webp",
        "regions": [
            {"regionId": "r1", "color": "#2bff88", "provinceIds": []},
            {"regionId": "r2", "color": "#2979ff", "provinceIds": []},
        ],
        "islands": [
            {
                "islandId": "i1",
                "backPath": "map-test/backs/1.webp",
                "svgPath": "map-test/pieces/big/1.svg",
                "left": 5,
                "top": 5,
                "width": 40,
                "aspectRatio": "1518 / 1036",
                "rotation": 0,
            },
            {
                "islandId": "i2",
                "backPath": "map-test/backs/2.webp",
                "svgPath": "map-test/pieces/big/2.svg",
                "left": 50,
                "top": 20,
                "width": 40,
                "aspectRatio": "1518 / 1036",
                "rotation": 0,
            },
        ],
        "provinces": [
            {"provinceId": "i1-p1", "name": "P1", "islandId": "i1", "pathIndex": 0, "regionId": "r1"},
            {"provinceId": "i1-p2", "name": "P2", "islandId": "i1", "pathIndex": 1, "regionId": "r1"},
            {"provinceId": "i2-p1", "name": "P3", "islandId": "i2", "pathIndex": 0, "regionId": "r2"},
            {"provinceId": "i2-p2", "name": "P4", "islandId": "i2", "pathIndex": 1, "regionId": "r2"},
        ],
    }

    lobby = Lobby(
        creator_id=1,
        name="multi",
        status="active",
        game_mode="free_for_all",
        map_size="small",
        max_players=2,
        faction_mode=False,
        faction_count=0,
        win_condition={"type": "territory_control", "threshold": 0.5},
    )
    db.add(lobby)
    db.flush()
    db.add(
        LobbyMap(
            lobby_id=lobby.id,
            map_size="small",
            map_kind="generated",
            map_config={"kind": "generated", "draft": draft},
        )
    )
    db.add(LobbyPlayer(lobby_id=lobby.id, user_id=1, faction_id=1, status="ready"))
    db.commit()

    png = render_lobby_map_thumbnail(lobby.id, width=320, db=db)
    assert png
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_thumbnail_endpoint(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'thumb.db'}")
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
        session.add(User(id=1, google_sub="g1", leetcode_username="alice"))
        lobby = Lobby(
            creator_id=1,
            name="thumb",
            status="active",
            game_mode="free_for_all",
            map_size="medium",
            max_players=2,
            faction_mode=False,
            faction_count=0,
            win_condition={"type": "territory_control", "threshold": 0.5},
        )
        session.add(lobby)
        session.flush()
        session.add(
            LobbyMap(
                lobby_id=lobby.id,
                map_size="medium",
                map_kind="generated",
                map_config={"kind": "generated", "draft": build_default_map_draft()},
            )
        )
        session.commit()
        lobby_id = lobby.id

    res = client.get(f"/api/lobbies/{lobby_id}/thumbnail.png?w=240")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/png")
    assert res.content[:8] == b"\x89PNG\r\n\x1a\n"

    res = client.get(f"/api/lobbies/{lobby_id}/thumbnail.png?w=240&fmt=webp&q=60")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/webp")
    assert res.content[:4] == b"RIFF"

    app.dependency_overrides.clear()
