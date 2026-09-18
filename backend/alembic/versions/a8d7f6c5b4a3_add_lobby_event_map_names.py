"""add_lobby_event_map_names

Revision ID: a8d7f6c5b4a3
Revises: 9c1a2b3d4e5f
Create Date: 2026-07-29 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8d7f6c5b4a3"
down_revision: Union[str, Sequence[str], None] = "9c1a2b3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("lobby_events", sa.Column("province_name", sa.String(), nullable=True))
    op.add_column("lobby_events", sa.Column("region_name", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("lobby_events", "region_name")
    op.drop_column("lobby_events", "province_name")
