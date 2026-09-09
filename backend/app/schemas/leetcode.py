from datetime import datetime

from pydantic import BaseModel, Field


class SolvedStats(BaseModel):
    total: int = 0
    easy: int = 0
    medium: int = 0
    hard: int = 0


class LeetCodeProfileResponse(BaseModel):
    username: str
    real_name: str | None = None
    avatar_url: str | None = None
    ranking: int | None = None
    solved: SolvedStats
    submission_calendar: dict[str, int]


class RecentAcceptedSubmission(BaseModel):
    title: str
    title_slug: str
    url: str
    submitted_at: str
    language: str | None = None
    submission_id: int | None = None
    submission_url: str | None = None
    runtime_ms: int | None = None


class LeetCodeLinkStartRequest(BaseModel):
    leetcode_username: str = Field(min_length=1, max_length=64)


class LeetCodeVerificationResponse(BaseModel):
    id: int
    leetcode_username: str
    problem_slug: str
    status: str
    attempts: int
    max_attempts: int
    created_at: datetime
    expires_at: datetime
    verified_at: datetime | None = None
    verified_submission_id: int | None = None
    verified_submission_at: datetime | None = None
    failure_reason: str | None = None
    cooldown_until: datetime | None = None


class LeetCodeLinkStatusResponse(BaseModel):
    linked: bool
    leetcode_username: str | None = None
    leetcode_verified_at: datetime | None = None
    verification: LeetCodeVerificationResponse | None = None
