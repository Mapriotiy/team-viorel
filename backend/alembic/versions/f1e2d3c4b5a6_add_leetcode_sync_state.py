"""add_leetcode_sync_state

Revision ID: f1e2d3c4b5a6
Revises: a8d7f6c5b4a3
Create Date: 2026-07-30 02:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1e2d3c4b5a6"
down_revision: Union[str, Sequence[str], None] = "a8d7f6c5b4a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("leetcode_recent_last_synced_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_recent_sync_started_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_recent_sync_error", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_profile_last_synced_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_profile_sync_started_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_profile_sync_error", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_avatar_url", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("leetcode_ranking", sa.Integer(), nullable=True))

    with op.batch_alter_table("lobbies") as batch_op:
        batch_op.add_column(sa.Column("last_synced_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("sync_started_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("sync_error", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("lobbies") as batch_op:
        batch_op.drop_column("sync_error")
        batch_op.drop_column("sync_started_at")
        batch_op.drop_column("last_synced_at")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("leetcode_ranking")
        batch_op.drop_column("leetcode_avatar_url")
        batch_op.drop_column("leetcode_profile_sync_error")
        batch_op.drop_column("leetcode_profile_sync_started_at")
        batch_op.drop_column("leetcode_profile_last_synced_at")
        batch_op.drop_column("leetcode_recent_sync_error")
        batch_op.drop_column("leetcode_recent_sync_started_at")
        batch_op.drop_column("leetcode_recent_last_synced_at")
