"""add powerups and fortify

Revision ID: e6f1a2b3c4d5
Revises: d7a1c2e3f4b5
Create Date: 2026-08-01

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e6f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "d7a1c2e3f4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    province_columns = {column["name"] for column in inspector.get_columns("lobby_map_provinces")}
    player_columns = {column["name"] for column in inspector.get_columns("lobby_players")}
    if "fortified_until" not in province_columns:
        op.add_column("lobby_map_provinces", sa.Column("fortified_until", sa.DateTime(), nullable=True))
    if "powerups" not in player_columns:
        op.add_column("lobby_players", sa.Column("powerups", sa.JSON(), nullable=True))
    if "granted_regions" not in player_columns:
        op.add_column("lobby_players", sa.Column("granted_regions", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("lobby_players") as batch_op:
        batch_op.drop_column("granted_regions")
        batch_op.drop_column("powerups")

    with op.batch_alter_table("lobby_map_provinces") as batch_op:
        batch_op.drop_column("fortified_until")
