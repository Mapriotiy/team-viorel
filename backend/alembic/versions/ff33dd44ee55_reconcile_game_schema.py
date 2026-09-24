"""reconcile the complete game schema on legacy databases

Revision ID: ff33dd44ee55
Revises: ff22cc33dd44
"""

from alembic import op
import sqlalchemy as sa


revision = "ff33dd44ee55"
down_revision = "ff22cc33dd44"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _add_missing_columns(table: str, columns: dict[str, sa.Column]) -> None:
    existing = _columns(table)
    for name, column in columns.items():
        if name not in existing:
            op.add_column(table, column)


def upgrade() -> None:
    tables = _tables()

    _add_missing_columns("lobbies", {
        "map_config": sa.Column("map_config", sa.JSON(), nullable=True),
        "replay_token": sa.Column("replay_token", sa.String(), nullable=True),
        "winner_id": sa.Column("winner_id", sa.Integer(), nullable=True),
        "winner_faction_id": sa.Column("winner_faction_id", sa.Integer(), nullable=True),
        "last_synced_at": sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        "sync_started_at": sa.Column("sync_started_at", sa.DateTime(), nullable=True),
        "sync_error": sa.Column("sync_error", sa.String(), nullable=True),
        "left_player_ids": sa.Column("left_player_ids", sa.JSON(), nullable=True),
    })
    _add_missing_columns("lobby_players", {
        "powerups": sa.Column("powerups", sa.JSON(), nullable=True),
        "granted_regions": sa.Column("granted_regions", sa.JSON(), nullable=True),
    })

    if "lobby_maps" not in tables:
        op.create_table(
            "lobby_maps",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lobby_id", sa.Integer(), sa.ForeignKey("lobbies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("map_size", sa.String(), nullable=False),
            sa.Column("map_kind", sa.String(), nullable=False, server_default="default"),
            sa.Column("map_config", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("lobby_id", name="uq_lobby_map"),
        )
    else:
        _add_missing_columns("lobby_maps", {
            "map_kind": sa.Column("map_kind", sa.String(), nullable=False, server_default="default"),
            "map_config": sa.Column("map_config", sa.JSON(), nullable=True),
        })

    if "lobby_map_provinces" not in tables:
        op.create_table(
            "lobby_map_provinces",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lobby_map_id", sa.Integer(), sa.ForeignKey("lobby_maps.id", ondelete="CASCADE"), nullable=False),
            sa.Column("province_id", sa.String(), nullable=False),
            sa.Column("region_id", sa.String(), nullable=False),
            sa.Column("province_name", sa.String(), nullable=True),
            sa.Column("region_name", sa.String(), nullable=True),
            sa.Column("topic_id", sa.String(), nullable=True),
            sa.Column("order_index", sa.Integer(), nullable=True),
            sa.Column("problem_title_slug", sa.String(), nullable=False),
            sa.Column("captured_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("captured_at", sa.DateTime(), nullable=True),
            sa.Column("captured_runtime_ms", sa.Integer(), nullable=True),
            sa.Column("captured_submission_url", sa.String(), nullable=True),
            sa.Column("capturer_leetcode_username", sa.String(), nullable=True),
            sa.Column("first_captured_by", sa.Integer(), nullable=True),
            sa.Column("first_captured_at", sa.DateTime(), nullable=True),
            sa.Column("fortified_until", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("lobby_map_id", "province_id", name="uq_lobby_map_province"),
        )
    else:
        _add_missing_columns("lobby_map_provinces", {
            "province_name": sa.Column("province_name", sa.String(), nullable=True),
            "region_name": sa.Column("region_name", sa.String(), nullable=True),
            "topic_id": sa.Column("topic_id", sa.String(), nullable=True),
            "order_index": sa.Column("order_index", sa.Integer(), nullable=True),
            "captured_runtime_ms": sa.Column("captured_runtime_ms", sa.Integer(), nullable=True),
            "first_captured_by": sa.Column("first_captured_by", sa.Integer(), nullable=True),
            "first_captured_at": sa.Column("first_captured_at", sa.DateTime(), nullable=True),
            "fortified_until": sa.Column("fortified_until", sa.DateTime(), nullable=True),
        })

    if "lobby_board_cells" not in tables:
        op.create_table(
            "lobby_board_cells",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("lobby_id", sa.Integer(), sa.ForeignKey("lobbies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("cell_index", sa.Integer(), nullable=False),
            sa.Column("problem_title_slug", sa.String(), nullable=False),
            sa.Column("claimed_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("claimed_at", sa.DateTime(), nullable=True),
            sa.Column("claimed_submission_url", sa.String(), nullable=True),
            sa.Column("claimer_leetcode_username", sa.String(), nullable=True),
            sa.UniqueConstraint("lobby_id", "cell_index", name="uq_lobby_board_cell"),
        )

    if "lobby_events" in tables:
        _add_missing_columns("lobby_events", {
            "province_name": sa.Column("province_name", sa.String(), nullable=True),
            "region_name": sa.Column("region_name", sa.String(), nullable=True),
            "runtime_ms": sa.Column("runtime_ms", sa.Integer(), nullable=True),
            "previous_runtime_ms": sa.Column("previous_runtime_ms", sa.Integer(), nullable=True),
        })

    # Legacy rows predate this JSON field. Normalize them before application reads.
    op.execute(sa.text("UPDATE lobbies SET left_player_ids = '[]' WHERE left_player_ids IS NULL"))


def downgrade() -> None:
    # This is a repair migration: dropping columns that may predate it would be destructive.
    pass
