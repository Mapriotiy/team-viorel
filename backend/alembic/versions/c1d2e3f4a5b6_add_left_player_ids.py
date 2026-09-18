"""add left_player_ids to lobbies

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f607
Create Date: 2026-08-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f607"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Fail fast if the table is locked by a long-running session (e.g. an open
    # SSE connection) instead of hanging the deploy with "no open ports".
    op.execute("SET lock_timeout = 30000")
    op.add_column("lobbies", sa.Column("left_player_ids", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("lobbies", "left_player_ids")
