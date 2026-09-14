"""add user activity tracking

Revision ID: b2c3d4e5f607
Revises: 6d01276943e1
Create Date: 2026-09-14 21:30:00.000000

Idempotent on purpose: the dev database may already carry the user_activity
table created by the real project. Anything that already exists is left
untouched.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "b2c3d4e5f607"
down_revision: Union[str, Sequence[str], None] = "6d01276943e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = inspect(conn)

    existing_tables = set(inspector.get_table_names())
    if 'user_activity' not in existing_tables:
        op.create_table(
            "user_activity",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("user_id", "date", name="uq_user_activity_user_date"),
        )
        op.create_index("ix_user_activity_user_id", "user_activity", ["user_id"])


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = inspect(conn)

    existing_tables = set(inspector.get_table_names())
    if 'user_activity' in existing_tables:
        op.drop_index("ix_user_activity_user_id", table_name="user_activity")
        op.drop_table("user_activity")