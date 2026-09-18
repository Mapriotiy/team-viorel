from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.friends import FriendResponse
from datetime import datetime


class TodaySubmissionResponse(BaseModel):
    title: str
    title_slug: str
    url: str
    submitted_at: str
    language: str | None = None
    difficulty: str | None = None
    topic_tags: list[str] = Field(default_factory=list)


class ActivityCalendarDayResponse(BaseModel):
    date: str
    count: int


class DashboardLobbyPlayerResponse(BaseModel):
    user_id: int
    leetcode_username: str | None = None
    faction_id: int | None = None
    status: str


class DashboardFactionResponse(BaseModel):
    id: int
    name: str
    color: str


class DashboardLobbyResponse(BaseModel):
    id: int
    name: str
    status: str
    game_mode: str
    map_size: str
    max_players: int
    faction_mode: bool = False
    faction_count: int = 0
    factions: list[DashboardFactionResponse] = Field(default_factory=list)
    programming_language: str = "python3"
    creator_id: int
    players: list[DashboardLobbyPlayerResponse] = Field(default_factory=list)
    winner_id: int | None = None
    winner_faction_id: int | None = None
    finished_at: datetime | None = None
    replay_token: str | None = None


class PlayerStatsResponse(BaseModel):
    games_played: int = 0
    games_won: int = 0
    win_rate: float = 0.0
    total_captures: int = 0


class DashboardResponse(BaseModel):
    leetcode_username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    leetcode_verified_at: datetime | None = None
    current_streak: int
    current_streak_state: Literal["lit", "pending", "broken"]
    today_active: bool
    longest_streak: int
    active_days_count: int
    today_submissions: list[TodaySubmissionResponse] = Field(default_factory=list)
    activity_calendar: list[ActivityCalendarDayResponse] = Field(default_factory=list)
    lobbies: list[DashboardLobbyResponse] = Field(default_factory=list)
    friends: list[FriendResponse] = Field(default_factory=list)
    stats: PlayerStatsResponse = Field(default_factory=PlayerStatsResponse)
