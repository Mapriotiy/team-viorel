from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class FactionResponse(BaseModel):
    id: int
    name: str
    color: str


class LobbyPlayerResponse(BaseModel):
    user_id: int
    leetcode_username: Optional[str] = None
    faction_id: Optional[int] = None
    status: str


class LobbyResponse(BaseModel):
    id: int
    creator_id: int
    name: str
    status: str
    game_mode: str
    map_size: str
    max_players: int
    faction_mode: bool
    faction_count: int
    factions: list[FactionResponse] = Field(default_factory=list)
    map_selection: Optional[dict[str, Any]] = None
    programming_language: str = "python3"
    win_condition: dict
    players: list[LobbyPlayerResponse]
    left_players: list[LobbyPlayerResponse] = Field(default_factory=list)
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    winner_id: Optional[int] = None
    winner_faction_id: Optional[int] = None
    invite_url: Optional[str] = None


class CreateLobbyRequest(BaseModel):
    name: str
    game_mode: str = "free_for_all"
    map_size: str = "medium"
    max_players: int = 2
    faction_mode: bool = False
    faction_count: int = 0
    programming_language: str = "python3"
    win_condition: dict = {"type": "points", "duration_hours": 0}


class CreateLobbyResponse(BaseModel):
    lobby: LobbyResponse
    invite_url: str


class LobbyMapSelectionRequest(BaseModel):
    kind: Literal["default", "generated"] = "default"
    draft: Optional[dict[str, Any]] = None


class LobbyMapSelectionResponse(BaseModel):
    selection: dict[str, Any]


class InviteLobbyResponse(BaseModel):
    lobby_id: int
    lobby_name: str
    creator_username: str
    player_count: int
    max_players: int
    faction_mode: bool = False
    faction_count: int = 0
    programming_language: str = "python3"
    status: str


class LobbyMapProvinceResponse(BaseModel):
    province_id: str
    region_id: str
    province_name: Optional[str] = None
    region_name: Optional[str] = None
    problem: Optional[dict] = None
    captured_by: Optional[int] = None
    captured_by_username: Optional[str] = None
    captured_at: Optional[datetime] = None
    captured_runtime_ms: Optional[int] = None
    captured_submission_url: Optional[str] = None
    capturer_leetcode_username: Optional[str] = None
    first_captured_by: Optional[int] = None
    fortified_until: Optional[datetime] = None


class WinnerInfo(BaseModel):
    """Winner block on game-state payloads; label None means a draw."""

    winner_user_id: Optional[int] = None
    winner_faction_id: Optional[int] = None
    label: Optional[str] = None


class LobbyScoreEntry(BaseModel):
    """Score line for one team: a faction, or a single player in free-for-all."""

    team_id: int
    label: str
    color: str
    provinces: int
    base_points: int
    bonus_points: int
    region_control_points: int = 0
    total_points: int


class LobbyMapResponse(BaseModel):
    lobby_id: int
    map_selection: Optional[dict[str, Any]] = None
    provinces: list[LobbyMapProvinceResponse]
    score: list[LobbyScoreEntry] = Field(default_factory=list)


class LobbyMapSyncResponse(BaseModel):
    captured_count: int
    recaptured_count: int = 0
    map_selection: Optional[dict[str, Any]] = None
    provinces: list[LobbyMapProvinceResponse]
    score: list[LobbyScoreEntry] = Field(default_factory=list)


class LobbyEventResponse(BaseModel):
    id: int
    province_id: Optional[str] = None
    province_name: Optional[str] = None
    region_name: Optional[str] = None
    event_type: str
    actor_user_id: int
    actor_username: str
    actor_faction_id: Optional[int] = None
    previous_owner_user_id: Optional[int] = None
    previous_owner_username: Optional[str] = None
    problem_title_slug: Optional[str] = None
    problem_title: Optional[str] = None
    problem_difficulty: Optional[str] = None
    points: Optional[int] = None
    runtime_ms: Optional[int] = None
    previous_runtime_ms: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateFactionRequest(BaseModel):
    name: str
    color: str


class UpdatePlayerFactionRequest(BaseModel):
    faction_id: int
