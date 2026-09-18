"""User-owned, reusable generated-map presets. A preset stores a full
GeneratedMapDraft so it can be applied to any lobby without regenerating."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.routes.lobby import _validate_generated_draft
from app.db.session import get_db
from app.models.map_preset import MapPreset
from app.models.user import User
from app.schemas.map_preset import CreateMapPresetRequest, MapPresetResponse

router = APIRouter()

MAX_NAME_LENGTH = 80


def _to_response(preset: MapPreset) -> MapPresetResponse:
    return MapPresetResponse(
        id=preset.id,
        name=preset.name,
        draft=preset.map_config,
        created_at=preset.created_at,
    )


@router.get("/", response_model=list[MapPresetResponse])
def list_map_presets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    presets = (
        db.query(MapPreset)
        .filter(MapPreset.user_id == current_user.id)
        .order_by(MapPreset.created_at.desc())
        .all()
    )
    return [_to_response(preset) for preset in presets]


@router.post("/", response_model=MapPresetResponse, status_code=201)
def create_map_preset(
    payload: CreateMapPresetRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Preset name is required")
    if len(name) > MAX_NAME_LENGTH:
        raise HTTPException(400, "Preset name is too long")

    draft = _validate_generated_draft(payload.draft)

    preset = MapPreset(user_id=current_user.id, name=name, map_config=draft)
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return _to_response(preset)


@router.delete("/{preset_id}", status_code=204)
def delete_map_preset(
    preset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    preset = db.get(MapPreset, preset_id)
    if not preset or preset.user_id != current_user.id:
        raise HTTPException(404, "Preset not found")
    db.delete(preset)
    db.commit()
