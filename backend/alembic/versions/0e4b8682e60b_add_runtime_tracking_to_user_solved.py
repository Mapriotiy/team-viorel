"""add runtime tracking to user_solved

Revision ID: 0e4b8682e60b
Revises: 4b365086b96f
Create Date: 2026-07-28 22:53:00.475261

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e4b8682e60b'
down_revision: Union[str, Sequence[str], None] = '4b365086b96f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user_solved', sa.Column('best_runtime_ms', sa.Integer(), nullable=True))
    op.add_column('user_solved', sa.Column('best_submission_url', sa.String(), nullable=True))
    op.add_column('user_solved', sa.Column('best_runtime_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user_solved', 'best_runtime_at')
    op.drop_column('user_solved', 'best_submission_url')
    op.drop_column('user_solved', 'best_runtime_ms')
