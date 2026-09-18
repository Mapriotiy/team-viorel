from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class FriendUserResponse(BaseModel):
    id: int
    leetcode_username: str | None = None


class CreateInviteResponse(BaseModel):
    token: str
    invite_url: str


class InviteResponse(BaseModel):
    token: str
    status: str
    inviter: FriendUserResponse
    created_at: datetime
    expires_at: datetime | None = None


class AcceptInviteResponse(BaseModel):
    friendship_id: int
    friend: FriendUserResponse


class TodayFriendStatusResponse(BaseModel):
    you_active: bool
    friend_active: bool
    shared_active: bool

class FriendStreakResponse(BaseModel):
    display_count: int
    current_count: int
    longest_count: int
    state: Literal["lit", "pending", "broken"]
    last_shared_active_date: date | None
    started_at: date
    today: TodayFriendStatusResponse


class FriendResponse(BaseModel):
    friendship_id: int
    friend: FriendUserResponse
    streak: FriendStreakResponse


class FriendSearchResponse(BaseModel):
    id: int
    leetcode_username: str | None = None
    display_name: str | None = None
    relation: Literal["none", "friend", "incoming", "outgoing"] = "none"
    request_id: int | None = None


class FriendRequestResponse(BaseModel):
    id: int
    requester: FriendUserResponse
    recipient: FriendUserResponse
    status: Literal["pending", "accepted", "declined", "cancelled"]
    created_at: datetime


class NotificationResponse(BaseModel):
    id: int
    notification_type: str
    actor: FriendUserResponse | None = None
    request_id: int | None = None
    payload: dict = Field(default_factory=dict)
    created_at: datetime
    read_at: datetime | None = None
