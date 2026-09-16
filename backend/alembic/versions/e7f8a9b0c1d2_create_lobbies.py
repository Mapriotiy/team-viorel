"""create lobbies and lobby players

Revision ID: e7f8a9b0c1d2
Revises: d5e6f7a8b9c1
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("lobbies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_lobbies_owner_id", "lobbies", ["owner_id"])
    op.create_table("lobby_players",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lobby_id", sa.Integer(), sa.ForeignKey("lobbies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("lobby_id", "user_id", name="uq_lobby_player"),
    )
    op.create_index("ix_lobby_players_lobby_id", "lobby_players", ["lobby_id"])
    op.create_index("ix_lobby_players_user_id", "lobby_players", ["user_id"])


def downgrade() -> None:
    op.drop_table("lobby_players")
    op.drop_index("ix_lobbies_owner_id", table_name="lobbies")
    op.drop_table("lobbies")
