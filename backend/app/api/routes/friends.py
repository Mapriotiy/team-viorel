from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User

router = APIRouter()

class FriendRequest(BaseModel):
    user_id: int = Field(gt=0)

@router.get("", response_model=list[dict])
def list_friends(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.execute(text("SELECT u.id, u.display_name, u.email FROM users u JOIN friendships f ON (f.friend_id=u.id) WHERE f.user_id=:uid"), {"uid": current_user.id}).mappings().all()
    return [{"id": r["id"], "display_name": r["display_name"] or r["email"] or f"User {r['id']}"} for r in rows]

@router.post("", response_model=dict, status_code=201)
def add_friend(payload: FriendRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if payload.user_id == current_user.id or db.get(User, payload.user_id) is None:
        raise HTTPException(404, "User not found")
    db.execute(text("CREATE TABLE IF NOT EXISTS friendships (user_id INTEGER NOT NULL, friend_id INTEGER NOT NULL, PRIMARY KEY (user_id, friend_id))"))
    db.execute(text("INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (:a,:b),(:b,:a)"), {"a": current_user.id, "b": payload.user_id})
    db.commit()
    return {"status": "ok"}

@router.delete("/{user_id}", status_code=204)
def remove_friend(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.execute(text("DELETE FROM friendships WHERE (user_id=:a AND friend_id=:b) OR (user_id=:b AND friend_id=:a)"), {"a": current_user.id, "b": user_id})
    db.commit()
