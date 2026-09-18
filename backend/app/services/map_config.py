"""Static map layout configuration and week calendar helpers."""

from datetime import date, datetime, time, timedelta, timezone

REGION_TOPICS: dict[str, dict] = {
    "isle1": {"tags": ["tree"], "difficulty": None},
    "isle2": {"tags": ["binary-search"], "difficulty": None},
    "isle3": {"tags": ["math"], "difficulty": None},
    "region1": {"tags": ["linked-list"], "difficulty": None},
    "region2": {"tags": ["two-pointers"], "difficulty": None},
    "region3": {"tags": ["array", "hash-table"], "difficulty": None},
    "region4": {"tags": ["stack"], "difficulty": None},
    "region5": {"tags": ["dynamic-programming"], "difficulty": None},
    "region6": {"tags": ["string"], "difficulty": None},
    "region7": {"tags": ["sorting"], "difficulty": None},
}

# Default map province → region, matching the static SVG's predefined
# boundaries (3 islands + 4 mainland blobs). Generated maps carry their own
# topic ids in the draft.
PROVINCE_REGION: dict[str, str] = {
    "path34": "isle1", "path36": "isle1",
    "path44": "isle2", "path48": "isle2", "path49": "isle2",
    "path53": "isle3",
    "path56": "region1", "path57": "region1", "path58": "region1", "path60": "region1",
    "path63": "region2", "path64": "region2", "path65": "region2", "path66": "region2",
    "path68": "region2", "path69": "region2",
    "path72": "region3", "path73": "region3", "path74": "region3", "path75": "region3",
    "path76": "region3", "path80": "region3", "path79": "region3",
    "path83": "region4", "path86": "region4", "path87": "region4",
    "path89": "region4", "path91": "region4",
}

REGION_NAMES: dict[str, str] = {
    "isle1": "Trees",
    "isle2": "Binary Search",
    "isle3": "Math",
    "region1": "Linked List",
    "region2": "Two Pointers",
    "region3": "Arrays & Hashing",
    "region4": "Stack",
}

REGION_COLORS: dict[str, str] = {
    "isle1": "#2fb55f",
    "isle2": "#4b6cb7",
    "isle3": "#c7429b",
    "region1": "#7ac142",
    "region2": "#5b6cf0",
    "region3": "#f2994a",
    "region4": "#eb5757",
}

PROVINCE_NAMES: dict[str, str] = {
    "path34": "Sylvan Canopy", "path36": "Rootveil Hollow",
    "path44": "Pivot Peak", "path48": "Midpoint Mesa", "path49": "Bisect Bluffs",
    "path53": "The Obsidian Gauntlet",
    "path56": "Node Haven", "path57": "Chainspire Coast", "path58": "Sentinel Shore", "path60": "Pointer's Rest",
    "path63": "Tidal Sliding Fen", "path64": "Dualstrike Fields", "path65": "Windowmere", "path66": "Slidevale",
    "path68": "Pointer's Drift", "path69": "Riftward Expanse",
    "path72": "Index Spire", "path73": "The Hashforge", "path74": "Keymount Steppe", "path75": "Cipher Ridge",
    "path76": "Saltwind Coast", "path79": "Bucket Bay", "path80": "Collision Crossing",
    "path83": "Pushdown Heights", "path86": "Popfall Hollow", "path87": "Peaktower Citadel", "path89": "Lastthrone Plateau",
    "path91": "Undarspire",
}

# The default (cinnamon) map is a fixed generated draft: one full-canvas
# island whose province polygons live in `maps/default-islands.svg` (flattened,
# in viewBox coordinates). Keeping it a normal generated draft means there is a
# single map pipeline everywhere — no separate "default map" renderer/seed.
DEFAULT_MAP_ISLAND_ID = "default"
DEFAULT_MAP_ISLAND_SVG = "maps/default-islands.svg"
DEFAULT_MAP_BACK = "maps/leet_background.webp"
DEFAULT_MAP_SEA_BASE = "maps/leet_background.webp"


def build_default_map_draft() -> dict:
    """Return the canonical GeneratedMapDraft for the default map.

    Province ids keep the legacy `pathNN` names so existing captures, events
    and replays stay valid. `pathIndex` follows the document order of the
    provinces in `default-islands.svg`, which matches PROVINCE_REGION order.
    """
    regions = [
        region_id
        for region_id in REGION_NAMES
        if any(rid == region_id for _pid, rid in PROVINCE_REGION.items())
    ]

    provinces: list[dict] = []
    region_provinces: dict[str, list[str]] = {region_id: [] for region_id in regions}
    for path_index, (province_id, region_id) in enumerate(PROVINCE_REGION.items()):
        provinces.append({
            "provinceId": province_id,
            "name": PROVINCE_NAMES.get(province_id, province_id),
            "islandId": DEFAULT_MAP_ISLAND_ID,
            "pathIndex": path_index,
            "regionId": region_id,
        })
        region_provinces[region_id].append(province_id)

    region_rows = [
        {
            "regionId": region_id,
            "topicId": region_id,
            "name": REGION_NAMES[region_id],
            "color": REGION_COLORS.get(region_id, "#8f7458"),
            "provinceIds": region_provinces[region_id],
            "provinceCount": len(region_provinces[region_id]),
            "splitAcrossIslands": False,
        }
        for region_id in regions
    ]

    topics = [
        {"id": region_id, "name": REGION_NAMES[region_id], "color": REGION_COLORS.get(region_id, "#8f7458")}
        for region_id in regions
    ]

    return {
        "schemaVersion": 1,
        "generatorVersion": "cinnamon-default-v1",
        "id": "cinnamon-default",
        "createdAt": "2026-08-01T00:00:00Z",
        "size": "medium",
        "regionCount": len(regions),
        "provinceCount": len(provinces),
        "seaBaseSrc": DEFAULT_MAP_SEA_BASE,
        "topics": topics,
        "islands": [{
            "islandId": DEFAULT_MAP_ISLAND_ID,
            "assetId": DEFAULT_MAP_ISLAND_ID,
            "size": "big",
            "left": 0,
            "top": 0,
            "width": 100,
            "aspectRatio": "1321 / 900",
            "rotation": 0,
            "zIndex": 1,
            "svgPath": DEFAULT_MAP_ISLAND_SVG,
            "backPath": DEFAULT_MAP_BACK,
        }],
        "seaSprites": [],
        "provinces": provinces,
        "regions": region_rows,
    }



def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def get_utc_today() -> date:
    return _utcnow().date()


def get_week_start(today: date | None = None) -> date:
    if today is None:
        today = get_utc_today()
    monday = today - timedelta(days=today.weekday())
    return monday


def week_start_datetime(week_start: date) -> datetime:
    """Naive UTC datetime for Monday 00:00 of the given week.

    DB datetimes are stored naive, so comparisons against solved_at must
    use naive UTC as well.
    """
    return datetime.combine(week_start, time.min)
