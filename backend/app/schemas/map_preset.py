from datetime import datetime
from typing import Any

from pydantic import BaseModel


class CreateMapPresetRequest(BaseModel):
    name: str
    draft: dict[str, Any]


class MapPresetResponse(BaseModel):
    id: int
    name: str
    draft: dict[str, Any]
    created_at: datetime
