from datetime import datetime

from pydantic import BaseModel, Field


class QuestProgress(BaseModel):
    key: str
    title: str
    description: str
    period: str
    progress: int
    target: int
    completed: bool
    reset_at: datetime


class QuestsResponse(BaseModel):
    daily: list[QuestProgress] = Field(default_factory=list)
    weekly: list[QuestProgress] = Field(default_factory=list)
