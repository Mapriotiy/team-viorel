from datetime import datetime

from pydantic import BaseModel, Field


class GoogleLoginUrlResponse(BaseModel):
    auth_url: str
    state: str


class GoogleCodeRequest(BaseModel):
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    google_sub: str | None = None
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    leetcode_username: str | None = None
    leetcode_verified_at: datetime | None = None
    is_admin: bool = False
    is_banned: bool = False
