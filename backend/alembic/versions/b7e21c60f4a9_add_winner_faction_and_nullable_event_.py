"""add_winner_faction_and_nullable_event_columns

Revision ID: b7e21c60f4a9
Revises: d48394d13ca5
Create Date: 2026-07-29 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7e21c60f4a9"
down_revision: Union[str, Sequence[str], None] = "d48394d13ca5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("lobbies") as batch_op:
        batch_op.add_column(sa.Column("winner_faction_id", sa.Integer(), nullable=True))

    # game_won events have no province/problem attached.
    with op.batch_alter_table("lobby_events") as batch_op:
        batch_op.alter_column("province_id", existing_type=sa.String(), nullable=True)
        batch_op.alter_column("problem_title_slug", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM lobby_events WHERE province_id IS NULL")
    with op.batch_alter_table("lobby_events") as batch_op:
        batch_op.alter_column("problem_title_slug", existing_type=sa.String(), nullable=False)
        batch_op.alter_column("province_id", existing_type=sa.String(), nullable=False)

    with op.batch_alter_table("lobbies") as batch_op:
        batch_op.drop_column("winner_faction_id")
