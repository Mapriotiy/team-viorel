import asyncio
from collections import Counter
from datetime import datetime

from app.models.leetcode_problem import LeetCodeProblem
from app.models.lobby import Lobby
from app.models.lobby_event import LobbyEvent
from app.models.lobby_map import LobbyMap
from app.models.lobby_map_province import LobbyMapProvince
from app.models.lobby_player import LobbyPlayer
from app.models.user import User
from app.services.capture_engine import CAPTURE, CaptureChange
from app.services.events import get_lobby_events, record_lobby_events
from app.services.game_modes.territory import TerritoryMode


def _problem(frontend_id: int, slug: str, tags: list[str], difficulty: str = "Medium") -> LeetCodeProblem:
    return LeetCodeProblem(
        frontend_id=frontend_id,
        title=slug.replace("-", " ").title(),
        title_slug=slug,
        difficulty=difficulty,
        topic_tags=tags,
    )


def test_generated_map_start_persists_draft_and_topic_problems(db):
    draft = {
        "schemaVersion": 1,
        "id": "generated-test-map",
        "size": "small",
        "seaBaseSrc": "map-test/sea-sprite.png",
        "islands": [{"islandId": "island1-big", "assetId": "1", "size": "big"}],
        "regions": [
            {
                "regionId": "region-01",
                "topicId": "region3",
                "name": "Arrays and Hashing",
                "color": "#e08900",
                "provinceIds": ["island1-big-province-001", "island1-big-province-002"],
            },
            {
                "regionId": "region-02",
                "topicId": "region4",
                "name": "Stacks",
                "color": "#ff0842",
                "provinceIds": ["island1-big-province-003", "island1-big-province-004"],
            },
        ],
        "provinces": [
            {
                "provinceId": "island1-big-province-001",
                "name": "Index Shore",
                "islandId": "island1-big",
                "pathIndex": 0,
                "regionId": "region-01",
            },
            {
                "provinceId": "island1-big-province-002",
                "name": "Bucket Bay",
                "islandId": "island1-big",
                "pathIndex": 1,
                "regionId": "region-01",
            },
            {
                "provinceId": "island1-big-province-003",
                "name": "Stack Peak",
                "islandId": "island1-big",
                "pathIndex": 2,
                "regionId": "region-02",
            },
            {
                "provinceId": "island1-big-province-004",
                "name": "Push Vale",
                "islandId": "island1-big",
                "pathIndex": 3,
                "regionId": "region-02",
            },
        ],
    }
    lobby = Lobby(
        id=1,
        creator_id=1,
        name="generated",
        status="waiting",
        game_mode="free_for_all",
        map_size="small",
        map_config={"kind": "generated", "draft": draft},
        max_players=2,
        faction_mode=False,
        faction_count=0,
        win_condition={"type": "territory_control", "threshold": 0.5},
    )
    players = []
    for user_id, username in [(1, "alice"), (2, "bob")]:
        user = User(
            id=user_id,
            leetcode_username=username,
            leetcode_verified_at=datetime(2026, 7, 27, 12, 0),
        )
        lobby_player = LobbyPlayer(
            lobby_id=lobby.id,
            user_id=user_id,
            faction_id=user_id,
            status="ready",
        )
        db.add(user)
        db.add(lobby_player)
        players.append((lobby_player, user))

    db.add(lobby)
    problems = [
        _problem(1, "array-easy", ["array", "hash-table"], "Easy"),
        _problem(2, "array-easy-2", ["array", "hash-table"], "Easy"),
        _problem(3, "array-medium", ["array", "hash-table"], "Medium"),
        _problem(4, "array-medium-2", ["array", "hash-table"], "Medium"),
        _problem(5, "array-hard", ["array", "hash-table"], "Hard"),
        _problem(6, "array-hard-2", ["array", "hash-table"], "Hard"),
        _problem(7, "stack-easy", ["stack"], "Easy"),
        _problem(8, "stack-easy-2", ["stack"], "Easy"),
        _problem(9, "stack-medium", ["stack"], "Medium"),
        _problem(10, "stack-medium-2", ["stack"], "Medium"),
        _problem(11, "stack-hard", ["stack"], "Hard"),
        _problem(12, "stack-hard-2", ["stack"], "Hard"),
    ]
    db.add_all(problems)
    db.flush()

    asyncio.run(TerritoryMode().start(lobby, players, db))
    db.commit()

    lmap = db.query(LobbyMap).filter_by(lobby_id=lobby.id).one()
    assert lmap.map_kind == "generated"
    assert lmap.map_config["draft"]["id"] == "generated-test-map"

    rows = (
        db.query(LobbyMapProvince)
        .filter_by(lobby_map_id=lmap.id)
        .order_by(LobbyMapProvince.order_index.asc())
        .all()
    )
    assert [row.province_name for row in rows] == ["Index Shore", "Bucket Bay", "Stack Peak", "Push Vale"]
    assert [row.topic_id for row in rows] == ["region3", "region3", "region4", "region4"]

    problems_by_slug = {problem.title_slug: problem for problem in problems}
    assert Counter(problems_by_slug[row.problem_title_slug].difficulty for row in rows) == Counter({
        "Easy": 2,
        "Medium": 1,
        "Hard": 1,
    })
    assert all(set(problems_by_slug[row.problem_title_slug].topic_tags) & {"array", "hash-table"} for row in rows[:2])
    assert all("stack" in problems_by_slug[row.problem_title_slug].topic_tags for row in rows[2:])

    payload = TerritoryMode().get_state(lobby, players, db)
    assert payload["map_selection"]["kind"] == "generated"
    assert payload["provinces"][0].province_name == "Index Shore"

    record_lobby_events(
        [
            CaptureChange(
                kind=CAPTURE,
                province=rows[0],
                actor_user_id=1,
                runtime_ms=120,
            )
        ],
        lobby,
        {problem.title_slug: problem for problem in problems},
        {1: "alice", 2: "bob"},
        {1: 1, 2: 2},
        db,
    )
    event = db.query(LobbyEvent).filter_by(lobby_id=lobby.id).one()
    assert event.province_name == "Index Shore"
    assert event.region_name == "Arrays and Hashing"

    event.province_name = None
    event.region_name = None
    db.commit()
    enriched_event = get_lobby_events(lobby.id, after_id=0, limit=10, db=db)[0]
    assert enriched_event.province_name == "Index Shore"


def test_default_map_starts_through_generated_path(db):
    lobby = Lobby(
        id=2,
        creator_id=1,
        name="default",
        status="waiting",
        game_mode="free_for_all",
        map_size="medium",
        map_config={"kind": "default"},
        max_players=2,
        faction_mode=False,
        faction_count=0,
        win_condition={"type": "territory_control", "threshold": 0.5},
    )
    user = User(id=1, leetcode_username="alice", leetcode_verified_at=datetime(2026, 7, 27, 12, 0))
    lobby_player = LobbyPlayer(lobby_id=lobby.id, user_id=1, faction_id=1, status="ready")
    db.add(lobby)
    db.add(user)
    db.add(lobby_player)

    db.add_all([
        _problem(i, f"p-{i}", ["math", "tree"], "Easy")
        for i in range(1, 40)
    ])
    db.flush()

    asyncio.run(TerritoryMode().start(lobby, [(lobby_player, user)], db))
    db.commit()

    lmap = db.query(LobbyMap).filter_by(lobby_id=lobby.id).one()
    assert lmap.map_kind == "generated"
    assert lmap.map_config["kind"] == "generated"
    assert lmap.map_config["draft"]["id"] == "cinnamon-default"
    assert lmap.map_config["draft"]["provinceCount"] == 28

    rows = (
        db.query(LobbyMapProvince)
        .filter_by(lobby_map_id=lmap.id)
        .order_by(LobbyMapProvince.order_index.asc())
        .all()
    )
    assert rows
    assert all(row.province_id.startswith("path") for row in rows)

    payload = TerritoryMode().get_state(lobby, [(lobby_player, user)], db)
    assert payload["map_selection"]["kind"] == "generated"
    assert payload["map_selection"]["draft"]["id"] == "cinnamon-default"
    assert payload["provinces"][0].province_id == "path34"
