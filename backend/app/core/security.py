from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

ALGORITHM = "HS256"
STREAM_TOKEN_EXPIRE_MINUTES = 5
ACCESS_COOKIE_NAME = "access_token"
CSRF_COOKIE_NAME = "csrf_token"


def create_access_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )

    payload = {
        "sub": str(user_id),
        "exp": expires_at,
    }

    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_stream_token(user_id: int) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=STREAM_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expires_at, "scope": "sse"},
        settings.secret_key,
        algorithm=ALGORITHM,
    )
