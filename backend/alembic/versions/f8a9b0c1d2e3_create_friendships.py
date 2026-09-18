"""create friendships
Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
"""
revision = "f8a9b0c1d2e3"
down_revision = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None
def upgrade():
    # Friendships are created by the original friend migration.
    pass
def downgrade():
    pass
