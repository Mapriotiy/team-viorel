"""add_generated_lobby_maps

Revision ID: 9c1a2b3d4e5f
Revises: e59a01c7d233
Create Date: 2026-07-29 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c1a2b3d4e5f"
down_revision: Union[str, Sequence[str], None] = "e59a01c7d233"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lobbies", sa.Column("map_config", sa.JSON(), nullable=True))
    op.add_column("lobby_maps", sa.Column("map_kind", sa.String(), nullable=False, server_default="default"))
    op.add_column("lobby_maps", sa.Column("map_config", sa.JSON(), nullable=True))
    op.add_column("lobby_map_provinces", sa.Column("province_name", sa.String(), nullable=True))
    op.add_column("lobby_map_provinces", sa.Column("region_name", sa.String(), nullable=True))
    op.add_column("lobby_map_provinces", sa.Column("topic_id", sa.String(), nullable=True))
    op.add_column("lobby_map_provinces", sa.Column("order_index", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("lobby_map_provinces", "order_index")
    op.drop_column("lobby_map_provinces", "topic_id")
    op.drop_column("lobby_map_provinces", "region_name")
    op.drop_column("lobby_map_provinces", "province_name")
    op.drop_column("lobby_maps", "map_config")
    op.drop_column("lobby_maps", "map_kind")
    op.drop_column("lobbies", "map_config")
