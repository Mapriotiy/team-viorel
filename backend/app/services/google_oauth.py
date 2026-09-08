"""Google OAuth 2.0 authorization code flow with PKCE.

The flow:
1. `GET /auth/google/login-url` creates a server-side OAuthSession (state,
   PKCE verifier, nonce) and returns a consent URL.
2. The frontend redirects the user to Google. Google redirects back to the
   frontend with `?code=...&state=...`.
3. The frontend posts `{code, state}` to the backend.
4. The backend exchanges the code (with client_secret + PKCE verifier),
   validates the ID token (signature via Google JWKS, audience, issuer, nonce),
   then finds-or-creates the user by `google_sub` and issues our own JWT.
"""

import base64
import hashlib
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import HTTPException, status
from jwt import PyJWK
from jwt.exceptions import InvalidTokenError

from app.core.config import settings

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_SCOPE = "openid email profile"
GOOGLE_ISSUER = "https://accounts.google.com"

_jwks_cache: dict[str, Any] | None = None
_jwks_cached_at = 0.0


def _clear_jwks_cache() -> None:
    global _jwks_cache, _jwks_cached_at
    _jwks_cache = None
    _jwks_cached_at = 0.0


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def generate_state() -> str:
    return secrets.token_urlsafe(32)


def generate_nonce() -> str:
    return secrets.token_urlsafe(32)


def generate_code_verifier() -> str:
    return secrets.token_urlsafe(48)


def code_challenge_from_verifier(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def build_authorization_url(
    *,
    state: str,
    nonce: str,
    code_challenge: str,
) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.effective_google_redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPE,
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def _fetch_jwks() -> dict[str, Any]:
    global _jwks_cache, _jwks_cached_at
    if _jwks_cache is not None and time.monotonic() - _jwks_cached_at < 3600:
        return _jwks_cache
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(GOOGLE_CERTS_URL)
        if response.status_code != status.HTTP_200_OK:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not fetch Google signing keys",
            )
        _jwks_cache = response.json()
        _jwks_cached_at = time.monotonic()
        return _jwks_cache


def verify_id_token(id_token: str, expected_nonce: str) -> dict[str, Any]:
    """Verify a Google ID token (RS256 signature via JWKS) and return its claims."""
    try:
        unverified_header = jwt.get_unverified_header(id_token)
    except InvalidTokenError as exc:
        logger.warning("Failed to parse Google ID token header: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate Google token",
        ) from exc

    kid = unverified_header.get("kid")
    alg = unverified_header.get("alg") or "RS256"

    keys = (_jwks_cache or {}).get("keys", [])
    jwk_data = next((key for key in keys if key.get("kid") == kid), None)
    if jwk_data is None:
        logger.warning("Google ID token kid=%s not found in JWKS (cached keys=%d)", kid, len(keys))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate Google token",
        )

    try:
        signing_key = PyJWK.from_dict(jwk_data)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=[alg],
            audience=settings.google_client_id,
            issuer=GOOGLE_ISSUER,
            options={
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
            },
        )
    except InvalidTokenError as exc:
        logger.warning(
            "Google ID token verification failed: %s: %s (aud=%s iss=%s)",
            type(exc).__name__,
            exc,
            settings.google_client_id,
            GOOGLE_ISSUER,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate Google token",
        ) from exc

    if claims.get("nonce") != expected_nonce:
        logger.warning("Google ID token nonce mismatch")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate Google token",
        )
    return claims


async def exchange_authorization_code(
    code: str,
    code_verifier: str,
) -> dict[str, Any]:
    """Exchange the authorization code for tokens from Google."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured",
        )

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.effective_google_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            },
        )

    if response.status_code != status.HTTP_200_OK:
        logger.warning(
            "Google token endpoint rejected the code: status=%s body=%s",
            response.status_code,
            response.text[:500],
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google rejected the authorization code",
        )
    return response.json()


async def verify_google_code(
    code: str,
    code_verifier: str,
    expected_nonce: str,
) -> dict[str, Any]:
    """Exchange the code and return verified ID-token claims."""
    token_data = await exchange_authorization_code(code, code_verifier)
    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google did not return an ID token",
        )
    # Refresh the JWKS before verifying so the cache is always populated.
    await _fetch_jwks()
    try:
        return verify_id_token(id_token, expected_nonce)
    except HTTPException as exc:
        if exc.detail != "Could not validate Google token":
            raise
        # Google may have rotated its signing keys; refresh once and retry.
        _clear_jwks_cache()
        await _fetch_jwks()
        return verify_id_token(id_token, expected_nonce)


def oauth_session_expires_at() -> datetime:
    return _utcnow().replace(tzinfo=None) + timedelta(minutes=10)
