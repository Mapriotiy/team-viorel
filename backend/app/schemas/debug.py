from datetime import datetime

from pydantic import BaseModel


class DebugPowerupsGrant(BaseModel):
    user_id: int
    reroll: int = 0
    fortify: int = 0
    siege: int = 0


class DebugCaptureRequest(BaseModel):
    user_id: int
    runtime_ms: int | None = None


class DebugFinishRequest(BaseModel):
    winner_user_id: int | None = None
    winner_faction_id: int | None = None


class DebugFinishResponse(BaseModel):
    status: str
    winner_user_id: int | None = None
    winner_faction_id: int | None = None


class DebugPowerupsResponse(BaseModel):
    user_id: int
    powerups: dict[str, int]


class DebugProvinceResponse(BaseModel):
    province_id: str
    captured_by: int | None = None
    captured_at: datetime | None = None
    captured_runtime_ms: int | None = None
    capturer_leetcode_username: str | None = None
    fortified_until: datetime | None = None
