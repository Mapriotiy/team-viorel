"""google identity + leetcode verification

Revision ID: d5e6f7a8b9c0
Revises: c3f4a5b6d7e8
Create Date: 2026-07-31

"""

import sqlalchemy as sa
from alembic import op

revision = "d5e6f7a8b9c0"
down_revision = "c3f4a5b6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users: Google identity replaces username/password auth.
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("google_sub", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("email", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("display_name", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("avatar_url", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_verified_at", sa.DateTime(), nullable=True))
        batch_op.alter_column("leetcode_username", existing_type=sa.String(), nullable=True)
        batch_op.drop_column("password_hash")

    op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # leetcode account linking sessions.
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

    # server-side OAuth state for the Google authorization code flow.
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
    op.drop_index("ix_oauth_sessions_state", table_name="oauth_sessions")
    op.drop_table("oauth_sessions")
    op.drop_index("ix_leetcode_account_verifications_status", table_name="leetcode_account_verifications")
    op.drop_index("ix_leetcode_account_verifications_user_id", table_name="leetcode_account_verifications")
    op.drop_table("leetcode_account_verifications")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_google_sub", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("password_hash", sa.String(), nullable=False))
        batch_op.alter_column("leetcode_username", existing_type=sa.String(), nullable=False)
        batch_op.drop_column("leetcode_verified_at")
        batch_op.drop_column("avatar_url")
        batch_op.drop_column("display_name")
        batch_op.drop_column("email")
        batch_op.drop_column("google_sub")
