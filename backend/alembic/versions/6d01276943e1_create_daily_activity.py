"""create daily activity

Revision ID: 6d01276943e1
Revises: d5e6f7a8b9c1
Create Date: 2026-09-14 21:10:00.000000

Idempotent on purpose: the dev database may already carry the daily_activity
table created by the real project. Anything that already exists is left
untouched.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '6d01276943e1'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = inspect(conn)

    existing_tables = set(inspector.get_table_names())
    if 'daily_activity' not in existing_tables:
        op.create_table('daily_activity',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('submissions_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'date', name='uq_daily_activity_user_date')
        )
        op.create_index(op.f('ix_daily_activity_date'), 'daily_activity', ['date'], unique=False)
        op.create_index(op.f('ix_daily_activity_id'), 'daily_activity', ['id'], unique=False)
        op.create_index(op.f('ix_daily_activity_user_id'), 'daily_activity', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = inspect(conn)

    existing_tables = set(inspector.get_table_names())
    if 'daily_activity' in existing_tables:
        op.drop_index(op.f('ix_daily_activity_user_id'), table_name='daily_activity')
        op.drop_index(op.f('ix_daily_activity_id'), table_name='daily_activity')
        op.drop_index(op.f('ix_daily_activity_date'), table_name='daily_activity')
        op.drop_table('daily_activity')