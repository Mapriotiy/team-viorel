"""add captured runtime to provinces

Revision ID: adbf1ff9b411
Revises: dbf4b30d09fd
Create Date: 2026-07-28 22:59:10.880822

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'adbf1ff9b411'
down_revision: Union[str, Sequence[str], None] = 'dbf4b30d09fd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'weekly_map_provinces',
        sa.Column('captured_runtime_ms', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('weekly_map_provinces', 'captured_runtime_ms')
