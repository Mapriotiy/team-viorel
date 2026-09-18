"""merge original and Sprint 2 migration heads

Revision ID: ff00aa11bb22
Revises: f4a5b6c7d8e9, f8a9b0c1d2e3
"""
from typing import Sequence, Union

revision: str = "ff00aa11bb22"
down_revision: Union[str, Sequence[str], None] = ("f4a5b6c7d8e9", "f8a9b0c1d2e3")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
