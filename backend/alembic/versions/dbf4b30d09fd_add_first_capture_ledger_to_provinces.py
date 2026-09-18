"""add first capture ledger to provinces

Revision ID: dbf4b30d09fd
Revises: 0e4b8682e60b
Create Date: 2026-07-28 22:55:24.975428

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'dbf4b30d09fd'
down_revision: Union[str, Sequence[str], None] = '0e4b8682e60b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Batch mode: SQLite cannot ALTER in a foreign-key constraint in place.
    with op.batch_alter_table('weekly_map_provinces') as batch_op:
        batch_op.add_column(sa.Column('first_captured_by', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('first_captured_at', sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            'fk_weekly_map_provinces_first_captured_by_users',
            'users',
            ['first_captured_by'],
            ['id'],
        )
    # Existing captors were by definition the first to capture their
    # provinces, so they keep the bonus retroactively.
    op.execute(
        "UPDATE weekly_map_provinces "
        "SET first_captured_by = captured_by, first_captured_at = captured_at "
        "WHERE captured_by IS NOT NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('weekly_map_provinces') as batch_op:
        batch_op.drop_constraint(
            'fk_weekly_map_provinces_first_captured_by_users',
            type_='foreignkey',
        )
        batch_op.drop_column('first_captured_at')
        batch_op.drop_column('first_captured_by')
