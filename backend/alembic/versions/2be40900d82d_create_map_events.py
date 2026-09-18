"""create map events

Revision ID: 2be40900d82d
Revises: adbf1ff9b411
Create Date: 2026-07-28 23:02:47.756685

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2be40900d82d'
down_revision: Union[str, Sequence[str], None] = 'adbf1ff9b411'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'map_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('friendship_id', sa.Integer(), nullable=False),
        sa.Column('weekly_map_id', sa.Integer(), nullable=False),
        sa.Column('province_id', sa.String(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('actor_user_id', sa.Integer(), nullable=False),
        sa.Column('actor_username', sa.String(), nullable=False),
        sa.Column('previous_owner_user_id', sa.Integer(), nullable=True),
        sa.Column('previous_owner_username', sa.String(), nullable=True),
        sa.Column('problem_title_slug', sa.String(), nullable=False),
        sa.Column('problem_title', sa.String(), nullable=True),
        sa.Column('problem_difficulty', sa.String(), nullable=True),
        sa.Column('points', sa.Integer(), nullable=True),
        sa.Column('runtime_ms', sa.Integer(), nullable=True),
        sa.Column('previous_runtime_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['friendship_id'], ['friendships.id']),
        sa.ForeignKeyConstraint(['weekly_map_id'], ['weekly_maps.id']),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['previous_owner_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_map_events_id'), 'map_events', ['id'], unique=False)
    op.create_index(op.f('ix_map_events_actor_user_id'), 'map_events', ['actor_user_id'], unique=False)
    op.create_index(op.f('ix_map_events_created_at'), 'map_events', ['created_at'], unique=False)
    op.create_index('ix_map_events_friendship_id_id', 'map_events', ['friendship_id', 'id'], unique=False)
    op.create_index('ix_map_events_weekly_map_id_id', 'map_events', ['weekly_map_id', 'id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_map_events_weekly_map_id_id', table_name='map_events')
    op.drop_index('ix_map_events_friendship_id_id', table_name='map_events')
    op.drop_index(op.f('ix_map_events_created_at'), table_name='map_events')
    op.drop_index(op.f('ix_map_events_actor_user_id'), table_name='map_events')
    op.drop_index(op.f('ix_map_events_id'), table_name='map_events')
    op.drop_table('map_events')
