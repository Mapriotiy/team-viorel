"""google identity and leetcode verification

Revision ID: d5e6f7a8b9c1
Revises: 35cf8ca6c7e6
Create Date: 2026-09-14 20:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c1'
down_revision: Union[str, Sequence[str], None] = '35cf8ca6c7e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users: replace the legacy email/password identity with a Google-backed one.
    op.add_column('users', sa.Column('google_sub', sa.String(), nullable=True))
    op.add_column('users', sa.Column('display_name', sa.String(), nullable=True))
    op.add_column('users', sa.Column('avatar_url', sa.String(), nullable=True))
    op.add_column('users', sa.Column('leetcode_username', sa.String(), nullable=True))
    op.add_column('users', sa.Column('leetcode_verified_at', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('is_banned', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index(op.f('ix_users_google_sub'), 'users', ['google_sub'], unique=True)
    op.create_index(op.f('ix_users_leetcode_username'), 'users', ['leetcode_username'], unique=True)
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('email', existing_type=sa.String(), nullable=True)
        batch_op.drop_column('password_hash')

    op.create_table(
        'oauth_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('state', sa.String(), nullable=False),
        sa.Column('code_verifier', sa.String(), nullable=False),
        sa.Column('nonce', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_oauth_sessions_state'), 'oauth_sessions', ['state'], unique=True)

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

    op.create_table(
        'leetcode_account_verifications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('leetcode_username', sa.String(), nullable=False),
        sa.Column('problem_slug', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('attempts', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('verified_at', sa.DateTime(), nullable=True),
        sa.Column('verified_submission_id', sa.Integer(), nullable=True),
        sa.Column('verified_submission_at', sa.DateTime(), nullable=True),
        sa.Column('failure_reason', sa.String(), nullable=True),
        sa.Column('last_attempt_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_leetcode_account_verifications_status'), 'leetcode_account_verifications', ['status'], unique=False)
    op.create_index(op.f('ix_leetcode_account_verifications_user_id'), 'leetcode_account_verifications', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_leetcode_account_verifications_user_id'), table_name='leetcode_account_verifications')
    op.drop_index(op.f('ix_leetcode_account_verifications_status'), table_name='leetcode_account_verifications')
    op.drop_table('leetcode_account_verifications')
    op.drop_index(op.f('ix_leetcode_problems_title_slug'), table_name='leetcode_problems')
    op.drop_index(op.f('ix_leetcode_problems_id'), table_name='leetcode_problems')
    op.drop_index(op.f('ix_leetcode_problems_frontend_id'), table_name='leetcode_problems')
    op.drop_table('leetcode_problems')
    op.drop_index(op.f('ix_oauth_sessions_state'), table_name='oauth_sessions')
    op.drop_table('oauth_sessions')
    op.drop_index(op.f('ix_users_leetcode_username'), table_name='users')
    op.drop_index(op.f('ix_users_google_sub'), table_name='users')
    op.add_column('users', sa.Column('password_hash', sa.String(), nullable=True))
    op.alter_column('users', 'email', existing_type=sa.String(), nullable=False)
    op.drop_column('users', 'is_banned')
    op.drop_column('users', 'is_admin')
    op.drop_column('users', 'leetcode_verified_at')
    op.drop_column('users', 'leetcode_username')
    op.drop_column('users', 'avatar_url')
    op.drop_column('users', 'display_name')
    op.drop_column('users', 'google_sub')