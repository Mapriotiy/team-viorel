from datetime import datetime

from pydantic import BaseModel, Field


class AdminUserOut(BaseModel):
    id: int
    google_sub: str | None = None
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    leetcode_username: str | None = None
    leetcode_verified_at: datetime | None = None
    is_admin: bool = False
    is_banned: bool = False
    created_at: datetime


class AdminUserListResponse(BaseModel):
    total: int
    offset: int
    limit: int
    users: list[AdminUserOut]


class AdminUserUpdate(BaseModel):
    is_admin: bool | None = None
    is_banned: bool | None = None


class AdminLobbyOut(BaseModel):
    id: int
    name: str
    status: str
    game_mode: str
    map_size: str
    max_players: int
    faction_mode: bool
    player_count: int
    creator_name: str | None = None
    winner_name: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    sync_error: str | None = None


class AdminLobbyListResponse(BaseModel):
    total: int
    offset: int
    limit: int
    lobbies: list[AdminLobbyOut]


class AdminDauDayResponse(BaseModel):
    date: str
    active: int


class AdminStatsResponse(BaseModel):
    total_users: int
    banned_users: int
    admin_users: int
    active_lobbies: int
    waiting_lobbies: int
    finished_lobbies: int
    games_today: int
    problem_count: int
    catalog_last_synced_at: datetime | None = None
    failed_syncs: int
    dau_today: int = 0
    dau_7d: int = 0
    solvers_today: int = 0
    dau_series: list[AdminDauDayResponse] = Field(default_factory=list)
