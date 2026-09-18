import pytest
from fastapi import HTTPException

from app.api.routes.map_presets import (
    create_map_preset,
    delete_map_preset,
    list_map_presets,
)
from app.models.user import User
from app.schemas.map_preset import CreateMapPresetRequest


def _draft() -> dict:
    return {
        "schemaVersion": 1,
        "size": "small",
        "islands": [{"islandId": "island1-big", "size": "big"}],
        "regions": [{"regionId": "region-01"}],
        "provinces": [{"provinceId": "p1", "regionId": "region-01"}],
    }


def _user(db, user_id: int, name: str) -> User:
    user = User(id=user_id, leetcode_username=name)
    db.add(user)
    db.commit()
    return user


def test_create_and_list_preset(db):
    user = _user(db, 1, "alice")
    created = create_map_preset(
        CreateMapPresetRequest(name="  My Trees Map  ", draft=_draft()),
        current_user=user,
        db=db,
    )
    assert created.name == "My Trees Map"  # trimmed
    assert created.draft["size"] == "small"

    presets = list_map_presets(current_user=user, db=db)
    assert [preset.id for preset in presets] == [created.id]


def test_create_rejects_blank_name(db):
    user = _user(db, 1, "alice")
    with pytest.raises(HTTPException) as exc:
        create_map_preset(
            CreateMapPresetRequest(name="   ", draft=_draft()),
            current_user=user,
            db=db,
        )
    assert exc.value.status_code == 400


def test_create_rejects_invalid_draft(db):
    user = _user(db, 1, "alice")
    with pytest.raises(HTTPException) as exc:
        create_map_preset(
            CreateMapPresetRequest(name="broken", draft={"schemaVersion": 2}),
            current_user=user,
            db=db,
        )
    assert exc.value.status_code == 400


def test_presets_are_scoped_per_user(db):
    alice = _user(db, 1, "alice")
    bob = _user(db, 2, "bob")
    created = create_map_preset(
        CreateMapPresetRequest(name="alice-map", draft=_draft()),
        current_user=alice,
        db=db,
    )

    # Bob cannot see alice's preset.
    assert list_map_presets(current_user=bob, db=db) == []

    # Bob cannot delete alice's preset.
    with pytest.raises(HTTPException) as exc:
        delete_map_preset(created.id, current_user=bob, db=db)
    assert exc.value.status_code == 404

    # Alice can delete her own.
    delete_map_preset(created.id, current_user=alice, db=db)
    assert list_map_presets(current_user=alice, db=db) == []
