"""ensure lobby sync columns on legacy databases

Revision ID: ff22cc33dd44
Revises: ff11bb22cc33
"""
from alembic import op
import sqlalchemy as sa

revision = "ff22cc33dd44"
down_revision = "ff11bb22cc33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("lobbies")}
    for name, column in (("last_synced_at", sa.DateTime()), ("sync_started_at", sa.DateTime()), ("sync_error", sa.String())):
        if name not in existing:
            op.add_column("lobbies", sa.Column(name, column, nullable=True))


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("lobbies")}
    for name in ("sync_error", "sync_started_at", "last_synced_at"):
        if name in existing:
            op.drop_column("lobbies", name)
