"""ensure lobby player JSON columns exist on legacy databases

Revision ID: ff11bb22cc33
Revises: ff00aa11bb22
"""
from alembic import op
import sqlalchemy as sa

revision = "ff11bb22cc33"
down_revision = "ff00aa11bb22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("lobby_players")}
    if "powerups" not in columns:
        op.add_column("lobby_players", sa.Column("powerups", sa.JSON(), nullable=True))
    if "granted_regions" not in columns:
        op.add_column("lobby_players", sa.Column("granted_regions", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("lobby_players")}
    if "granted_regions" in columns:
        op.drop_column("lobby_players", "granted_regions")
    if "powerups" in columns:
        op.drop_column("lobby_players", "powerups")
