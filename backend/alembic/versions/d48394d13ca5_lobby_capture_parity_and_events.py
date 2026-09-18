"""lobby_capture_parity_and_events

Revision ID: d48394d13ca5
Revises: 7a2c5f9d4b1e
Create Date: 2026-07-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d48394d13ca5"
down_revision: Union[str, Sequence[str], None] = "7a2c5f9d4b1e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("lobby_map_provinces") as batch_op:
        batch_op.add_column(sa.Column("captured_runtime_ms", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("first_captured_by", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("first_captured_at", sa.DateTime(), nullable=True))
        batch_op.create_foreign_key(
            "fk_lobby_map_provinces_first_captured_by_users",
            "users",
            ["first_captured_by"],
            ["id"],
        )

    # Provinces captured under the old first-to-solve rule keep their captor
    # as the permanent first-captor, matching the weekly-map backfill.
    op.execute(
        "UPDATE lobby_map_provinces "
        "SET first_captured_by = captured_by, first_captured_at = captured_at "
        "WHERE captured_by IS NOT NULL"
    )

    op.create_table(
        "lobby_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lobby_id", sa.Integer(), nullable=False),
        sa.Column("province_id", sa.String(), nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=False),
        sa.Column("actor_username", sa.String(), nullable=False),
        sa.Column("actor_faction_id", sa.Integer(), nullable=True),
        sa.Column("previous_owner_user_id", sa.Integer(), nullable=True),
        sa.Column("previous_owner_username", sa.String(), nullable=True),
        sa.Column("problem_title_slug", sa.String(), nullable=False),
        sa.Column("problem_title", sa.String(), nullable=True),
        sa.Column("problem_difficulty", sa.String(), nullable=True),
        sa.Column("points", sa.Integer(), nullable=True),
        sa.Column("runtime_ms", sa.Integer(), nullable=True),
        sa.Column("previous_runtime_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["lobby_id"], ["lobbies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["previous_owner_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lobby_events_id"), "lobby_events", ["id"], unique=False)
    op.create_index(
        op.f("ix_lobby_events_actor_user_id"), "lobby_events", ["actor_user_id"], unique=False
    )
    op.create_index(
        op.f("ix_lobby_events_created_at"), "lobby_events", ["created_at"], unique=False
    )
    op.create_index(
        "ix_lobby_events_lobby_id_id", "lobby_events", ["lobby_id", "id"], unique=False
    )

    # Never used: win-condition config lives in lobbies.win_condition JSON.
    op.drop_index(op.f("ix_win_conditions_id"), table_name="win_conditions")
    op.drop_table("win_conditions")


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        "win_conditions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_win_conditions_id"), "win_conditions", ["id"], unique=False)

    op.drop_index("ix_lobby_events_lobby_id_id", table_name="lobby_events")
    op.drop_index(op.f("ix_lobby_events_created_at"), table_name="lobby_events")
    op.drop_index(op.f("ix_lobby_events_actor_user_id"), table_name="lobby_events")
    op.drop_index(op.f("ix_lobby_events_id"), table_name="lobby_events")
    op.drop_table("lobby_events")

    with op.batch_alter_table("lobby_map_provinces") as batch_op:
        batch_op.drop_constraint(
            "fk_lobby_map_provinces_first_captured_by_users", type_="foreignkey"
        )
        batch_op.drop_column("first_captured_at")
        batch_op.drop_column("first_captured_by")
        batch_op.drop_column("captured_runtime_ms")
