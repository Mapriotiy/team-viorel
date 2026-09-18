"""create friendships
Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
"""
from alembic import op
import sqlalchemy as sa
revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None
def upgrade():
    op.create_table("friendships", sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True), sa.Column("friend_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True))
def downgrade(): op.drop_table("friendships")
