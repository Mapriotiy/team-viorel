from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LobbyBoardCell(Base):
    """One cell of a non-map board game (bingo): a task claimed by solving it.

    cell_index is row-major: row = cell_index // 5, col = cell_index % 5.
    Claims are permanent — board modes have no runtime recapture, so a
    completed line can never be retroactively broken.
    """

    __tablename__ = "lobby_board_cells"
    __table_args__ = (UniqueConstraint("lobby_id", "cell_index", name="uq_lobby_board_cell"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    lobby_id: Mapped[int] = mapped_column(
        ForeignKey("lobbies.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    cell_index: Mapped[int] = mapped_column(Integer, nullable=False)
    problem_title_slug: Mapped[str] = mapped_column(String, nullable=False)
    claimed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    claimed_submission_url: Mapped[str | None] = mapped_column(String, nullable=True)
    claimer_leetcode_username: Mapped[str | None] = mapped_column(String, nullable=True)
