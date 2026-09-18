from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class ProblemResponse(BaseModel):
    title: str
    title_slug: str
    difficulty: str
    url: str


class ProvinceResponse(BaseModel):
    province_id: str
    region_id: str
    region_name: str
    problem: Optional[ProblemResponse] = None
    captured_by: Optional[int] = None
    captured_by_username: Optional[str] = None
    captured_at: Optional[datetime] = None
    captured_submission_url: Optional[str] = None
    capturer_leetcode_username: Optional[str] = None
    captured_runtime_ms: Optional[int] = None
    first_captured_by: Optional[int] = None
    first_captured_at: Optional[datetime] = None


class ScoreResponse(BaseModel):
    player_provinces: int
    friend_provinces: int
    neutral_provinces: int
    total_provinces: int
    player_regions: int
    friend_regions: int
    total_regions: int
    player_points: int = 0
    friend_points: int = 0
    player_base_points: int = 0
    friend_base_points: int = 0
    player_bonus_points: int = 0
    friend_bonus_points: int = 0


class LastWeekResult(BaseModel):
    week_start: date
    winner_user_id: Optional[int] = None
    winner_username: Optional[str] = None
    player_regions: int
    friend_regions: int
    total_regions: int


class WeeklyMapResponse(BaseModel):
    week_start: date
    friendship_id: int
    provinces: list[ProvinceResponse]
    score: ScoreResponse
    player_avatar_url: Optional[str] = None
    friend_avatar_url: Optional[str] = None
    last_week_result: Optional[LastWeekResult] = None


class SyncResponse(BaseModel):
    captured_count: int
    recaptured_count: int = 0
    provinces: list[ProvinceResponse]
    score: ScoreResponse
    player_avatar_url: Optional[str] = None
    friend_avatar_url: Optional[str] = None