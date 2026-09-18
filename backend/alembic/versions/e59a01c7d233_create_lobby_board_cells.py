"""create_lobby_board_cells

Revision ID: e59a01c7d233
Revises: b7e21c60f4a9
Create Date: 2026-07-29 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e59a01c7d233"
down_revision: Union[str, Sequence[str], None] = "b7e21c60f4a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "lobby_board_cells",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lobby_id", sa.Integer(), nullable=False),
        sa.Column("cell_index", sa.Integer(), nullable=False),
        sa.Column("problem_title_slug", sa.String(), nullable=False),
        sa.Column("claimed_by", sa.Integer(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("claimed_submission_url", sa.String(), nullable=True),
        sa.Column("claimer_leetcode_username", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["lobby_id"], ["lobbies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["claimed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lobby_id", "cell_index", name="uq_lobby_board_cell"),
    )
    op.create_index(op.f("ix_lobby_board_cells_id"), "lobby_board_cells", ["id"], unique=False)
    op.create_index(
        op.f("ix_lobby_board_cells_lobby_id"), "lobby_board_cells", ["lobby_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_lobby_board_cells_lobby_id"), table_name="lobby_board_cells")
    op.drop_index(op.f("ix_lobby_board_cells_id"), table_name="lobby_board_cells")
    op.drop_table("lobby_board_cells")
