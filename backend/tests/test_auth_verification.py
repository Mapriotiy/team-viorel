"""Tests for Google identity fields, LeetCode account verification, and sync gating."""

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.leetcode_account_verification import LeetCodeAccountVerification
from app.models.user import User
from app.services.leetcode_verification import (
    MAX_ATTEMPTS,
    VERIFICATION_WINDOW_MINUTES,
    active_verification_for,
    start_verification,
    unlink_verification,
    verify_verification,
)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc_epoch(value: datetime) -> int:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp())


def make_user(db, username: str | None = None, *, verified=False) -> User:
    user = User(
        google_sub=f"sub-{username or 'user'}",
        email=f"{username or 'user'}@example.com",
        display_name="Some Name",
        avatar_url="https://example.com/a.png",
        leetcode_username=username,
        leetcode_verified_at=_now() if verified else None,
    )
    db.add(user)
    db.commit()
    return user


def make_fake_submissions_file(tmp_path, entries: list[dict], username: str = "alice") -> str:
    path = tmp_path / "submissions.json"
    path.write_text(json.dumps({username: entries}))
    return str(path)


def run_verify(user, verification, db):
    return asyncio.run(verify_verification(user, verification, db))


# ── Google identity fields ──


def test_user_google_fields(db):
    user = make_user(db, "alice")
    assert user.google_sub
    assert user.email
    assert user.display_name
    assert user.avatar_url
    assert user.leetcode_verified_at is None
    assert user.leetcode_username == "alice"


def test_duplicate_google_sub_rejected(db):
    make_user(db, "alice")
    with pytest.raises(Exception):
        second = User(google_sub="sub-alice", leetcode_username="bob")
        db.add(second)
        db.commit()


# ── Start verification ──


def test_start_verification_creates_pending_session(db):
    user = make_user(db)
    verification = start_verification(user, "  Alice  ", db)

    assert verification.leetcode_username == "alice"
    assert verification.problem_slug == "two-sum"
    assert verification.status == "pending"
    assert verification.attempts == 0
    assert verification.expires_at > _now()
    assert verification.expires_at < _now() + timedelta(minutes=VERIFICATION_WINDOW_MINUTES + 1)


def test_start_verification_blocks_already_linked_user(db):
    user = make_user(db, verified=True)
    with pytest.raises(HTTPException) as exc:
        start_verification(user, "alice", db)
    assert exc.value.status_code == 409


def test_start_verification_blocks_username_taken_by_verified_user(db):
    make_user(db, "alice", verified=True)
    other = make_user(db, "bob")
    with pytest.raises(HTTPException) as exc:
        start_verification(other, "alice", db)
    assert exc.value.status_code == 409


def test_pending_sessions_do_not_block_other_users(db):
    """One user's pending session must not block another user from the same username."""
    user_a = make_user(db, "alice")
    user_b = make_user(db, "bob")
    start_verification(user_a, "shared", db)
    verification_b = start_verification(user_b, "shared", db)

    assert verification_b.leetcode_username == "shared"
    assert verification_b.status == "pending"


def test_start_verification_expires_previous_pending(db):
    user = make_user(db)
    first = start_verification(user, "one", db)
    second = start_verification(user, "two", db)

    assert first.status == "expired"
    assert second.status == "pending"
    assert active_verification_for(user.id, db).id == second.id


# ── Verify ──


def test_verify_success_links_account(db, tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, []))
    user = make_user(db)
    verification = start_verification(user, "alice", db)

    in_window = _utc_epoch(verification.created_at) + 60
    submissions = [{
        "id": 999, "title": "Two Sum", "titleSlug": "two-sum",
        "timestamp": str(in_window), "lang": "python3", "runtime": "167 ms",
    }]
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, submissions))

    result = run_verify(user, verification, db)

    assert result.status == "verified"
    assert result.verified_submission_id == 999
    assert user.leetcode_username == "alice"
    assert user.leetcode_verified_at is not None


def test_verify_rejects_wrong_problem(db, tmp_path, monkeypatch):
    in_window = _utc_epoch(_now()) + 60
    submissions = [{
        "id": 1, "title": "Reverse String", "titleSlug": "reverse-string",
        "timestamp": str(in_window), "lang": "python3", "runtime": "10 ms",
    }]
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, submissions))

    user = make_user(db)
    verification = start_verification(user, "alice", db)
    with pytest.raises(HTTPException) as exc:
        run_verify(user, verification, db)
    assert exc.value.status_code == 400
    assert verification.attempts == 1
    assert user.leetcode_verified_at is None


def test_verify_rejects_old_submission_before_window(db, tmp_path, monkeypatch):
    before_window = _utc_epoch(_now()) - 3600
    submissions = [{
        "id": 1, "title": "Two Sum", "titleSlug": "two-sum",
        "timestamp": str(before_window), "lang": "python3", "runtime": "10 ms",
    }]
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, submissions))

    user = make_user(db)
    verification = start_verification(user, "alice", db)
    with pytest.raises(HTTPException) as exc:
        run_verify(user, verification, db)
    assert exc.value.status_code == 400
    assert verification.attempts == 1


def test_verify_cooldown(db, tmp_path, monkeypatch):
    in_window = _utc_epoch(_now()) + 60
    submissions = [{
        "id": 1, "title": "Two Sum", "titleSlug": "two-sum",
        "timestamp": str(in_window), "lang": "python3", "runtime": "10 ms",
    }]
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, submissions))

    user = make_user(db)
    verification = start_verification(user, "alice", db)
    verification.last_attempt_at = _now()
    db.commit()

    with pytest.raises(HTTPException) as exc:
        run_verify(user, verification, db)
    assert exc.value.status_code == 429
    assert verification.attempts == 0


def test_verify_expired_window(db, tmp_path, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, []))
    user = make_user(db)
    verification = start_verification(user, "alice", db)
    verification.expires_at = _now() - timedelta(seconds=1)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        run_verify(user, verification, db)
    assert exc.value.status_code == 400
    assert verification.status == "expired"


def test_verify_max_attempts_fails_session(db, tmp_path, monkeypatch):
    submissions = [{
        "id": 1, "title": "Not Two Sum", "titleSlug": "not-two-sum",
        "timestamp": str(_utc_epoch(_now()) + 60), "lang": "python3", "runtime": "10 ms",
    }]
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, submissions))

    user = make_user(db)
    verification = start_verification(user, "alice", db)
    verification.attempts = MAX_ATTEMPTS
    db.commit()

    with pytest.raises(HTTPException) as exc:
        run_verify(user, verification, db)
    assert exc.value.status_code == 400
    assert verification.status == "failed"


def test_verify_race_username_conflict(db, tmp_path, monkeypatch):
    """If another user claims the username in between, verification fails cleanly."""
    in_window = _utc_epoch(_now()) + 60
    submissions = [{
        "id": 5, "title": "Two Sum", "titleSlug": "two-sum",
        "timestamp": str(in_window), "lang": "python3", "runtime": "20 ms",
    }]
    monkeypatch.setattr("app.core.config.settings.leetcode_fake_submissions_path", make_fake_submissions_file(tmp_path, submissions, username="shared"))

    user = make_user(db, "alice")
    verification = start_verification(user, "shared", db)

    other = make_user(db, "charlie")
    other.leetcode_username = "shared"
    other.leetcode_verified_at = _now()
    db.commit()

    with pytest.raises(HTTPException) as exc:
        run_verify(user, verification, db)
    assert exc.value.status_code == 409


# ── Unlink ──


def test_unlink_clears_pending_and_verified(db):
    user = make_user(db)
    start_verification(user, "alice", db)
    db.refresh(user)

    unlink_verification(user, db)

    assert user.leetcode_username is None
    assert user.leetcode_verified_at is None
    assert active_verification_for(user.id, db) is None


def test_unlink_releases_username_for_other_user(db):
    owner = make_user(db, "alice", verified=True)
    other = make_user(db, "bob")

    unlink_verification(owner, db)

    verification = start_verification(other, "alice", db)
    assert verification.leetcode_username == "alice"
    assert verification.status == "pending"


# ── Sync gating ──


def test_sync_skipped_for_unverified_user(db):
    from app.services.leetcode_sync import is_leetcode_verified, maybe_sync_user_daily_activity

    unverified = make_user(db, "bob")
    assert is_leetcode_verified(unverified) is False

    profile, submissions, meta = asyncio.run(maybe_sync_user_daily_activity(unverified, db))
    assert meta["status"] == "skipped"
    assert profile is None
    assert submissions == []


def test_sync_allowed_for_verified_user(db):
    from app.services.leetcode_sync import is_leetcode_verified

    verified = make_user(db, "alice", verified=True)
    assert is_leetcode_verified(verified) is True


# ── API level ──


def test_auth_and_link_api_flow(tmp_path, monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from fastapi.testclient import TestClient

    from app.core.security import create_access_token
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import app

    engine = create_engine(f"sqlite:///{tmp_path / 'api.db'}")
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    monkeypatch.setattr("app.core.config.settings.google_client_id", "test-client")
    monkeypatch.setattr("app.core.config.settings.google_client_secret", "test-secret")

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            # Google login URL (no exchange — that needs real Google).
            res = client.get("/api/auth/google/login-url")
            assert res.status_code == 200
            data = res.json()
            assert "accounts.google.com" in data["auth_url"]
            assert data["state"]

            assert client.get("/api/auth/me").status_code == 401

            user = User(google_sub="sub-1", email="a@b.com", display_name="Alice")
            with TestSession() as session:
                session.add(user)
                session.commit()
                user_id = user.id

            headers = {"Authorization": f"Bearer {create_access_token(user_id)}"}

            me = client.get("/api/auth/me", headers=headers).json()
            assert me["google_sub"] == "sub-1"
            assert me["email"] == "a@b.com"
            assert me["display_name"] == "Alice"
            assert me["leetcode_username"] is None
            assert me["leetcode_verified_at"] is None

            # Start verification.
            start = client.post(
                "/api/leetcode/link/start",
                headers=headers,
                json={"leetcode_username": "alice"},
            )
            assert start.status_code == 200
            assert start.json()["status"] == "pending"

            status = client.get("/api/leetcode/link/status", headers=headers).json()
            assert status["linked"] is False
            assert status["verification"]["status"] == "pending"

            # Verify against fake submissions with an in-window Two Sum.
            in_window = _utc_epoch(_now()) + 60
            monkeypatch.setattr(
                "app.core.config.settings.leetcode_fake_submissions_path",
                make_fake_submissions_file(tmp_path, [{
                    "id": 777, "title": "Two Sum", "titleSlug": "two-sum",
                    "timestamp": str(in_window), "lang": "python3", "runtime": "88 ms",
                }]),
            )
            verify = client.post("/api/leetcode/link/verify", headers=headers)
            assert verify.status_code == 200, verify.text
            assert verify.json()["status"] == "verified"

            status = client.get("/api/leetcode/link/status", headers=headers).json()
            assert status["linked"] is True
            assert status["leetcode_username"] == "alice"

            # Unlink.
            unlink = client.delete("/api/leetcode/link", headers=headers)
            assert unlink.status_code == 200
            status = client.get("/api/leetcode/link/status", headers=headers).json()
            assert status["linked"] is False
            assert status["leetcode_username"] is None
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_google_code_exchange_full_chain(tmp_path, monkeypatch):
    """End-to-end: fake Google token endpoint + fake JWKS -> app JWT + user.

    Validates ID-token signature (RS256), audience, issuer and nonce without
    hitting the real Google."""
    import time
    import jwt as pyjwt
    from cryptography.hazmat.primitives.asymmetric import rsa
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.core.config import settings
    from app.db.base import Base
    from app.db.session import get_db
    from app.main import app
    from app.services import google_oauth

    monkeypatch.setattr(settings, "google_client_id", "test-client.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "test-secret")

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_numbers = private_key.public_key().public_numbers()
    n = public_numbers.n
    e = public_numbers.e

    def _int_to_b64(value: int) -> str:
        raw = value.to_bytes((value.bit_length() + 7) // 8 or 1, "big")
        import base64
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

    jwks = {
        "keys": [{
            "kty": "RSA",
            "use": "sig",
            "alg": "RS256",
            "kid": "test-key-1",
            "n": _int_to_b64(n),
            "e": _int_to_b64(e),
        }]
    }
    monkeypatch.setattr(google_oauth, "_jwks_cache", jwks)
    monkeypatch.setattr(google_oauth, "_jwks_cached_at", time.monotonic())

    captured = {}

    async def fake_exchange(code: str, code_verifier: str) -> dict:
        captured["code"] = code
        captured["verifier"] = code_verifier
        id_token = pyjwt.encode(
            {
                "iss": "https://accounts.google.com",
                "aud": "test-client.apps.googleusercontent.com",
                "sub": "google-user-123",
                "email": "realuser@gmail.com",
                "email_verified": True,
                "name": "Real User",
                "picture": "https://example.com/pic.png",
                "nonce": captured["nonce"],
                "iat": int(_utc_epoch(_now())),
                "exp": int(_utc_epoch(_now())) + 3600,
            },
            private_key,
            algorithm="RS256",
            headers={"kid": "test-key-1"},
        )
        return {"id_token": id_token}

    monkeypatch.setattr(google_oauth, "exchange_authorization_code", fake_exchange)

    engine = create_engine(f"sqlite:///{tmp_path / 'exchange.db'}")
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)

    def override_get_db():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as client:
            res = client.get("/api/auth/google/login-url")
            assert res.status_code == 200
            state = res.json()["state"]

            with TestSession() as session:
                from app.models.oauth_session import OAuthSession
                oauth_session = (
                    session.query(OAuthSession).filter_by(state=state).one()
                )
                captured["nonce"] = oauth_session.nonce

            exchange = client.post(
                "/api/auth/google/code",
                json={"code": "google-auth-code", "state": state},
            )
            assert exchange.status_code == 200, exchange.text
            assert captured["code"] == "google-auth-code"
            assert captured["verifier"] == oauth_session.code_verifier

            token = exchange.json()["access_token"]
            assert pyjwt.decode(token, settings.secret_key, algorithms=["HS256"])["sub"]

            me = client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert me.status_code == 200, me.text
            body = me.json()
            assert body["google_sub"] == "google-user-123"
            assert body["email"] == "realuser@gmail.com"
            assert body["display_name"] == "Real User"
            assert body["avatar_url"] == "https://example.com/pic.png"
            assert body["leetcode_username"] is None

            # Code/session is single-use.
            again = client.post(
                "/api/auth/google/code",
                json={"code": "google-auth-code", "state": state},
            )
            assert again.status_code == 401
    finally:
        app.dependency_overrides.clear()
        engine.dispose()



