"""add language to user_solved

Revision ID: 7a2c5f9d4b1e
Revises: 118cb4d8edaf
Create Date: 2026-07-29 05:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7a2c5f9d4b1e"
down_revision: Union[str, Sequence[str], None] = "118cb4d8edaf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("user_solved") as batch_op:
        batch_op.add_column(
            sa.Column("language", sa.String(), server_default="unknown", nullable=False),
        )
        batch_op.drop_constraint("uq_user_solved_user_slug", type_="unique")
        batch_op.create_unique_constraint(
            "uq_user_solved_user_slug_language",
            ["user_id", "title_slug", "language"],
        )
        batch_op.create_index("ix_user_solved_language", ["language"], unique=False)

    # Separate batch: SQLite recreates the table from the accumulated batch
    # ops, so dropping the server_default has to happen only after the first
    # recreation has backfilled existing rows with "unknown" - otherwise the
    # single recreated table has no default and the data copy violates
    # NOT NULL for any pre-existing rows.
    with op.batch_alter_table("user_solved") as batch_op:
        batch_op.alter_column("language", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("user_solved") as batch_op:
        batch_op.drop_constraint("uq_user_solved_user_slug_language", type_="unique")
        batch_op.create_unique_constraint(
            "uq_user_solved_user_slug",
            ["user_id", "title_slug"],
        )
        batch_op.drop_index("ix_user_solved_language")
        batch_op.drop_column("language")
