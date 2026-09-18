from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class MapPreset(BaseModel):
    id: str
    name: str
    description: str
    width: int
    height: int
    preview_url: str | None = None


PRESETS = [
    MapPreset(id="classic", name="Classic Valley", description="A balanced starter map for new teams.", width=8, height=8, preview_url=None),
    MapPreset(id="coastline", name="Coastline", description="Open routes with a wide shoreline.", width=10, height=6, preview_url=None),
    MapPreset(id="crossroads", name="Crossroads", description="Compact map with four strategic lanes.", width=7, height=7, preview_url=None),
]


@router.get("", response_model=list[MapPreset])
def list_map_presets():
    return PRESETS


@router.get("/{preset_id}", response_model=MapPreset)
def get_map_preset(preset_id: str):
    from fastapi import HTTPException
    preset = next((item for item in PRESETS if item.id == preset_id), None)
    if preset is None:
        raise HTTPException(status_code=404, detail="Map preset not found")
    return preset
