"""create_leetcode_sync_states

Revision ID: c3f4a5b6d7e8
Revises: f1e2d3c4b5a6
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3f4a5b6d7e8"
down_revision: Union[str, Sequence[str], None] = "f1e2d3c4b5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "leetcode_sync_states",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(length=32), nullable=False),
        sa.Column("sync_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="idle"),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("error", sa.String(), nullable=True),
        sa.Column("sync_metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope", "sync_key", name="uq_leetcode_sync_states_scope_key"),
    )
    op.create_index("ix_leetcode_sync_states_scope", "leetcode_sync_states", ["scope"])
    op.create_index("ix_leetcode_sync_states_sync_key", "leetcode_sync_states", ["sync_key"])


def downgrade() -> None:
    op.drop_index("ix_leetcode_sync_states_sync_key", table_name="leetcode_sync_states")
    op.drop_index("ix_leetcode_sync_states_scope", table_name="leetcode_sync_states")
    op.drop_table("leetcode_sync_states")
