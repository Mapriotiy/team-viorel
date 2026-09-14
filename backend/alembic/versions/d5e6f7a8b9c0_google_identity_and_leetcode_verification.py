"""google identity + leetcode verification

Revision ID: d5e6f7a8b9c0
Revises: 35cf8ca6c7e6
Create Date: 2026-07-31

Idempotent on purpose:
- On a FRESH database it converts the legacy email/password users table into the
  Google-backed schema and creates oauth_sessions + leetcode_account_verifications.
- On a database that was migrated by the real project (alembic_version already
  at d5e6f7a8b9c0) this revision is NOT re-applied, only d5e6f7a8b9c1 runs.
  Anything that already exists is left untouched so existing data survives.

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "d5e6f7a8b9c0"
down_revision = "35cf8ca6c7e6"
branch_labels = None
depends_on = None


def _ensure_column(batch_op, inspector, table, name, column):
    cols = {c["name"] for c in inspector.get_columns(table)}
    if name not in cols:
        batch_op.add_column(column)


def _ensure_index(op, table, column):
    idx_name = f"ix_{table}_{column}"
    inspector = inspect(op.get_bind())
    existing = {i["name"] for i in inspector.get_indexes(table)}
    if idx_name not in existing:
        op.create_index(idx_name, table, [column])


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    users_cols = {c["name"] for c in inspector.get_columns("users")}

    # Google identity: replace username/password auth.
    with op.batch_alter_table("users") as batch_op:
        _ensure_column(batch_op, inspector, "users", "google_sub",
                       sa.Column("google_sub", sa.String(), nullable=True))
        _ensure_column(batch_op, inspector, "users", "display_name",
                       sa.Column("display_name", sa.String(), nullable=True))
        _ensure_column(batch_op, inspector, "users", "avatar_url",
                       sa.Column("avatar_url", sa.String(), nullable=True))
        _ensure_column(batch_op, inspector, "users", "leetcode_username",
                       sa.Column("leetcode_username", sa.String(), nullable=True))
        _ensure_column(batch_op, inspector, "users", "leetcode_verified_at",
                       sa.Column("leetcode_verified_at", sa.DateTime(), nullable=True))
        if "email" in users_cols:
            batch_op.alter_column(
                "email", existing_type=sa.String(), nullable=True)
        if "password_hash" in users_cols:
            batch_op.drop_column("password_hash")

    # Fresh databases: index google_sub/email/leetcode_username.
    inspector = inspect(conn)
    users_cols = {c["name"] for c in inspector.get_columns("users")}
    if "google_sub" in users_cols:
        _ensure_index(op, "users", "google_sub")
    if "email" in users_cols:
        _ensure_index(op, "users", "email")
    if "leetcode_username" in users_cols:
        _ensure_index(op, "users", "leetcode_username")

    existing_tables = set(inspector.get_table_names())

    # LeetCode account linking sessions.
    if "leetcode_account_verifications" not in existing_tables:
        op.create_table(
            "leetcode_account_verifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("leetcode_username", sa.String(), nullable=False),
            sa.Column("problem_slug", sa.String(), nullable=False, server_default="two-sum"),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("verified_submission_id", sa.Integer(), nullable=True),
            sa.Column("verified_submission_at", sa.DateTime(), nullable=True),
            sa.Column("failure_reason", sa.String(), nullable=True),
            sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        )
        op.create_index(
            "ix_leetcode_account_verifications_user_id",
            "leetcode_account_verifications",
            ["user_id"],
        )
        op.create_index(
            "ix_leetcode_account_verifications_status",
            "leetcode_account_verifications",
            ["status"],
        )

    # Server-side OAuth state for the Google authorization code flow.
    if "oauth_sessions" not in existing_tables:
        op.create_table(
            "oauth_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("state", sa.String(), nullable=False),
            sa.Column("code_verifier", sa.String(), nullable=False),
            sa.Column("nonce", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_oauth_sessions_state", "oauth_sessions", ["state"], unique=True)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())

    if "oauth_sessions" in existing_tables:
        op.drop_index("ix_oauth_sessions_state", table_name="oauth_sessions")
        op.drop_table("oauth_sessions")
    if "leetcode_account_verifications" in existing_tables:
        op.drop_index("ix_leetcode_account_verifications_status", table_name="leetcode_account_verifications")
        op.drop_index("ix_leetcode_account_verifications_user_id", table_name="leetcode_account_verifications")
        op.drop_table("leetcode_account_verifications")

    users_cols = {c["name"] for c in inspector.get_columns("users")}
    with op.batch_alter_table("users") as batch_op:
        for col in ("leetcode_username", "leetcode_verified_at",
                    "avatar_url", "display_name", "google_sub"):
            if col in users_cols:
                batch_op.drop_column(col)