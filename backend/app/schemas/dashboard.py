from typing import Literal

from pydantic import BaseModel, Field


class TodaySubmissionResponse(BaseModel):
    title: str
    title_slug: str
    url: str
    submitted_at: str
    language: str | None = None


class ActivityCalendarDayResponse(BaseModel):
    date: str
    count: int


class DashboardResponse(BaseModel):
    leetcode_username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    leetcode_verified_at: str | None = None
    current_streak: int
    current_streak_state: Literal["lit", "pending", "broken"]
    today_active: bool
    longest_streak: int
    active_days_count: int
    today_submissions: list[TodaySubmissionResponse] = Field(default_factory=list)
    activity_calendar: list[ActivityCalendarDayResponse] = Field(default_factory=list)