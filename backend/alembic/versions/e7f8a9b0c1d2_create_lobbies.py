"""create lobbies and lobby players

Revision ID: e7f8a9b0c1d2
Revises: d5e6f7a8b9c1
"""
from typing import Sequence, Union

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Lobby tables are owned by the original create_lobby_system migration.
    # This compatibility revision intentionally performs no DDL.
    pass


def downgrade() -> None:
    pass
