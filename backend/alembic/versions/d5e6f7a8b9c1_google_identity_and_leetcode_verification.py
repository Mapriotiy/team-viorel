"""vio-code extras: admin/ban flags + ensure problem catalog

Revision ID: d5e6f7a8b9c1
Revises: d5e6f7a8b9c0
Create Date: 2026-09-14 20:45:00.000000

Idempotent on purpose: the dev database may already carry the tables that the
real project created. Anything that already exists is left untouched, so the
leetcode_problems data filled by the seed script survives.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c1'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    users_cols = {col["name"] for col in inspector.get_columns("users")}
    with op.batch_alter_table('users') as batch_op:
        if 'is_admin' not in users_cols:
            batch_op.add_column(
                sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false())
            )
        if 'is_banned' not in users_cols:
            batch_op.add_column(
                sa.Column('is_banned', sa.Boolean(), nullable=False, server_default=sa.false())
            )

    existing_tables = set(inspector.get_table_names())
    if 'leetcode_problems' not in existing_tables:
        op.create_table(
            'leetcode_problems',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('frontend_id', sa.Integer(), nullable=False),
            sa.Column('title', sa.String(), nullable=False),
            sa.Column('title_slug', sa.String(), nullable=False),
            sa.Column('difficulty', sa.String(), nullable=False),
            sa.Column('topic_tags', sa.JSON(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_leetcode_problems_frontend_id'), 'leetcode_problems', ['frontend_id'], unique=True)
        op.create_index(op.f('ix_leetcode_problems_id'), 'leetcode_problems', ['id'], unique=False)
        op.create_index(op.f('ix_leetcode_problems_title_slug'), 'leetcode_problems', ['title_slug'], unique=True)


def downgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    users_cols = {col["name"] for col in inspector.get_columns("users")}
    with op.batch_alter_table('users') as batch_op:
        if 'is_banned' in users_cols:
            batch_op.drop_column('is_banned')
        if 'is_admin' in users_cols:
            batch_op.drop_column('is_admin')