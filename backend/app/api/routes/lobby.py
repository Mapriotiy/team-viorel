from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.lobby import Lobby, LobbyPlayer
from app.models.user import User
from app.schemas.lobby import LobbyCreateRequest, LobbyPlayerResponse, LobbyResponse

router = APIRouter()


def _as_response(lobby: Lobby, db: Session) -> LobbyResponse:
    rows = (
        db.query(LobbyPlayer, User)
        .join(User, User.id == LobbyPlayer.user_id)
        .filter(LobbyPlayer.lobby_id == lobby.id)
        .order_by(LobbyPlayer.joined_at, LobbyPlayer.id)
        .all()
    )
    players = [LobbyPlayerResponse(user_id=row.user_id, display_name=row.display_name or row.email or f"User {row.user_id}") for row, _ in rows]
    return LobbyResponse(id=lobby.id, name=lobby.name, owner_id=lobby.owner_id, capacity=lobby.capacity,
                         status=lobby.status, player_count=len(players), players=players,
                         created_at=lobby.created_at)


@router.post("", response_model=LobbyResponse, status_code=status.HTTP_201_CREATED)
def create_lobby(payload: LobbyCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Lobby name cannot be blank")
    lobby = Lobby(name=name, capacity=payload.capacity, owner_id=current_user.id)
    db.add(lobby)
    db.flush()
    db.add(LobbyPlayer(lobby_id=lobby.id, user_id=current_user.id))
    db.commit()
    db.refresh(lobby)
    return _as_response(lobby, db)


@router.post("/{lobby_id}/join", response_model=LobbyResponse)
def join_lobby(lobby_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lobby = db.get(Lobby, lobby_id)
    if lobby is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    existing = db.query(LobbyPlayer).filter_by(lobby_id=lobby_id, user_id=current_user.id).first()
    if existing:
        return _as_response(lobby, db)
    count = db.query(func.count(LobbyPlayer.id)).filter(LobbyPlayer.lobby_id == lobby_id).scalar() or 0
    if lobby.status != "open" or count >= lobby.capacity:
        raise HTTPException(status_code=409, detail="Lobby is full or closed")
    db.add(LobbyPlayer(lobby_id=lobby_id, user_id=current_user.id))
    db.commit()
    return _as_response(lobby, db)


@router.get("/{lobby_id}", response_model=LobbyResponse)
def get_lobby(lobby_id: int, db: Session = Depends(get_db)):
    lobby = db.get(Lobby, lobby_id)
    if lobby is None:
        raise HTTPException(status_code=404, detail="Lobby not found")
    return _as_response(lobby, db)
