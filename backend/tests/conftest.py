import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.daily_activity import DailyActivity  # noqa: F401
from app.models.friend_invite import FriendInvite  # noqa: F401
from app.models.friendship import Friendship  # noqa: F401
from app.models.leetcode_problem import LeetCodeProblem  # noqa: F401
from app.models.leetcode_sync_state import LeetCodeSyncState  # noqa: F401
from app.models.leetcode_account_verification import LeetCodeAccountVerification  # noqa: F401
from app.models.oauth_session import OAuthSession  # noqa: F401
from app.models.lobby import Lobby  # noqa: F401
from app.models.lobby_board_cell import LobbyBoardCell  # noqa: F401
from app.models.lobby_event import LobbyEvent  # noqa: F401
from app.models.lobby_invite import LobbyInvite  # noqa: F401
from app.models.lobby_map import LobbyMap  # noqa: F401
from app.models.lobby_map_province import LobbyMapProvince  # noqa: F401
from app.models.lobby_player import LobbyPlayer  # noqa: F401
from app.models.map_event import MapEvent  # noqa: F401
from app.models.map_preset import MapPreset  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.user_activity import UserActivity  # noqa: F401
from app.models.user_solved import UserSolved  # noqa: F401
from app.models.weekly_map import WeeklyMap  # noqa: F401
from app.models.weekly_map_province import WeeklyMapProvince  # noqa: F401


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
