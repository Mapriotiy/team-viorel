from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LobbyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    capacity: int = Field(default=4, ge=2, le=8)


class LobbyPlayerResponse(BaseModel):
    user_id: int
    display_name: str


class LobbyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    owner_id: int
    capacity: int
    status: str
    player_count: int
    players: list[LobbyPlayerResponse]
    created_at: datetime
