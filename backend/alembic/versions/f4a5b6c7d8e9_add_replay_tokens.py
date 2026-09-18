"""add opaque replay tokens

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lobbies", sa.Column("replay_token", sa.String(), nullable=True))
    op.create_index("ix_lobbies_replay_token", "lobbies", ["replay_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_lobbies_replay_token", table_name="lobbies")
    op.drop_column("lobbies", "replay_token")
