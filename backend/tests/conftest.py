import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.leetcode_problem import LeetCodeProblem  # noqa: F401
from app.models.leetcode_account_verification import LeetCodeAccountVerification  # noqa: F401
from app.models.oauth_session import OAuthSession  # noqa: F401
from app.models.user import User  # noqa: F401


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