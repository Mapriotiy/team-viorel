from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MapEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    friendship_id: int
    weekly_map_id: int
    province_id: str
    event_type: str
    actor_user_id: int
    actor_username: str
    previous_owner_user_id: Optional[int] = None
    previous_owner_username: Optional[str] = None
    problem_title_slug: str
    problem_title: Optional[str] = None
    problem_difficulty: Optional[str] = None
    points: Optional[int] = None
    runtime_ms: Optional[int] = None
    previous_runtime_ms: Optional[int] = None
    created_at: datetime


class FeedItemResponse(MapEventResponse):
    friend_id: int
    friend_username: str
