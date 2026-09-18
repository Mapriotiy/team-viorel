from datetime import datetime, timezone

import logging
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import ACCESS_COOKIE_NAME, CSRF_COOKIE_NAME, create_access_token, create_stream_token
from app.db.session import get_db
from app.models.oauth_session import OAuthSession
from app.models.user import User
from app.schemas.auth import (
    GoogleCodeRequest,
    GoogleLoginUrlResponse,
    MeResponse,
    TokenResponse,
)
from app.services.google_oauth import (
    build_authorization_url,
    code_challenge_from_verifier,
    generate_code_verifier,
    generate_nonce,
    generate_state,
    oauth_session_expires_at,
    verify_google_code,
)
from app.services.activity_tracking import record_user_activity
from app.services.rate_limit import enforce_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/google/login-url", response_model=GoogleLoginUrlResponse)
def google_login_url(request: Request, db: Session = Depends(get_db)):
    """Start Google OAuth: create a server-side session and return the consent URL."""
    enforce_rate_limit(request, "oauth-start", 10, 600)
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured",
        )

    state = generate_state()
    nonce = generate_nonce()
    code_verifier = generate_code_verifier()

    db.add(
        OAuthSession(
            state=state,
            code_verifier=code_verifier,
            nonce=nonce,
            expires_at=oauth_session_expires_at(),
        )
    )
    db.commit()

    auth_url = build_authorization_url(
        state=state,
        nonce=nonce,
        code_challenge=code_challenge_from_verifier(code_verifier),
    )
    return GoogleLoginUrlResponse(auth_url=auth_url, state=state)


@router.post("/google/code", response_model=TokenResponse)
async def google_code(request: Request, response: Response, payload: GoogleCodeRequest, db: Session = Depends(get_db)):
    """Exchange the Google authorization code for our own JWT."""
    enforce_rate_limit(request, "oauth-code", 10, 600)
    session = db.query(OAuthSession).filter_by(state=payload.state).first()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google login session",
        )
    if session.used_at is not None:
        logger.warning(
            "Google login session %s already used at %s",
            payload.state[:8],
            session.used_at,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google login session",
        )
    if session.expires_at < _utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google login session expired",
        )

    session.used_at = _utcnow()
    db.commit()

    try:
        claims = await verify_google_code(
            payload.code,
            session.code_verifier,
            session.nonce,
        )
    except HTTPException as exc:
        logger.warning(
            "Google code exchange failed for state=%s: %s (%s)",
            payload.state[:8],
            exc.detail,
            exc.status_code,
        )
        raise
    except Exception as exc:
        logger.exception("Unexpected Google code exchange error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not exchange Google token",
        ) from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token missing subject",
        )

    email = claims.get("email") if claims.get("email_verified") else None
    display_name = claims.get("name")
    avatar_url = claims.get("picture")

    user = db.query(User).filter(User.google_sub == sub).first()
    if user is None:
        user = User(
            google_sub=sub,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        if email:
            user.email = email
        if display_name:
            user.display_name = display_name
        if avatar_url:
            user.avatar_url = avatar_url

    db.commit()
    db.refresh(user)
    access_token = create_access_token(user.id)
    csrf_token = secrets.token_urlsafe(32)
    secure = settings.environment.lower() in {"production", "prod"} or settings.database_url.startswith("postgresql")
    same_site = "none" if secure else "lax"
    response.set_cookie(ACCESS_COOKIE_NAME, access_token, httponly=True, secure=secure, samesite=same_site, max_age=settings.access_token_expire_minutes * 60, path="/")
    response.set_cookie(CSRF_COOKIE_NAME, csrf_token, httponly=False, secure=secure, samesite=same_site, max_age=settings.access_token_expire_minutes * 60, path="/")
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=MeResponse)
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    record_user_activity(current_user.id, db)
    return MeResponse(
        id=current_user.id,
        google_sub=current_user.google_sub,
        email=current_user.email,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
        leetcode_username=current_user.leetcode_username,
        leetcode_verified_at=current_user.leetcode_verified_at,
        is_admin=current_user.is_admin,
        is_banned=current_user.is_banned,
    )


@router.get("/stream-token", response_model=TokenResponse)
def stream_token(current_user: User = Depends(get_current_user)):
    return TokenResponse(access_token=create_stream_token(current_user.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
