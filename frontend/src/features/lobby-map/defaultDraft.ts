import type { GeneratedMapDraft } from './types';
import { mapColors } from './mapColors';

// Canonical draft for the default (cinnamon) map. Keep in sync with
// backend/app/services/map_config.py::build_default_map_draft().
// Province ids ("pathNN") are stable so existing captures/replays stay valid;
// pathIndex follows the document order of maps/default-islands.svg.

export const DEFAULT_MAP_DRAFT: GeneratedMapDraft = {
    "schemaVersion": 1,
    "generatorVersion": "cinnamon-default-v1",
    "id": "cinnamon-default",
    "createdAt": "2026-08-01T00:00:00Z",
    "size": "medium",
    "regionCount": 7,
    "provinceCount": 28,
    "seaBaseSrc": "maps/leet_background.webp",
    "topics": [
        {
            "id": "isle1",
            "name": "Trees",
            "color": mapColors.regions.isle1
        },
        {
            "id": "isle2",
            "name": "Binary Search",
            "color": mapColors.regions.isle2
        },
        {
            "id": "isle3",
            "name": "Math",
            "color": mapColors.regions.isle3
        },
        {
            "id": "region1",
            "name": "Linked List",
            "color": mapColors.regions.region1
        },
        {
            "id": "region2",
            "name": "Two Pointers",
            "color": mapColors.regions.region2
        },
        {
            "id": "region3",
            "name": "Arrays & Hashing",
            "color": mapColors.regions.region3
        },
        {
            "id": "region4",
            "name": "Stack",
            "color": mapColors.regions.region4
        }
    ],
    "islands": [
        {
            "islandId": "default",
            "assetId": "default",
            "size": "big",
            "left": 0,
            "top": 0,
            "width": 100,
            "aspectRatio": "1321 / 900",
            "rotation": 0,
            "zIndex": 1,
            "svgPath": "maps/default-islands.svg",
            "backPath": "maps/leet_background.webp"
        }
    ],
    "seaSprites": [],
    "provinces": [
        {
            "provinceId": "path34",
            "name": "Sylvan Canopy",
            "islandId": "default",
            "pathIndex": 0,
            "regionId": "isle1"
        },
        {
            "provinceId": "path36",
            "name": "Rootveil Hollow",
            "islandId": "default",
            "pathIndex": 1,
            "regionId": "isle1"
        },
        {
            "provinceId": "path44",
            "name": "Pivot Peak",
            "islandId": "default",
            "pathIndex": 2,
            "regionId": "isle2"
        },
        {
            "provinceId": "path48",
            "name": "Midpoint Mesa",
            "islandId": "default",
            "pathIndex": 3,
            "regionId": "isle2"
        },
        {
            "provinceId": "path49",
            "name": "Bisect Bluffs",
            "islandId": "default",
            "pathIndex": 4,
            "regionId": "isle2"
        },
        {
            "provinceId": "path53",
            "name": "The Obsidian Gauntlet",
            "islandId": "default",
            "pathIndex": 5,
            "regionId": "isle3"
        },
        {
            "provinceId": "path56",
            "name": "Node Haven",
            "islandId": "default",
            "pathIndex": 6,
            "regionId": "region1"
        },
        {
            "provinceId": "path57",
            "name": "Chainspire Coast",
            "islandId": "default",
            "pathIndex": 7,
            "regionId": "region1"
        },
        {
            "provinceId": "path58",
            "name": "Sentinel Shore",
            "islandId": "default",
            "pathIndex": 8,
            "regionId": "region1"
        },
        {
            "provinceId": "path60",
            "name": "Pointer's Rest",
            "islandId": "default",
            "pathIndex": 9,
            "regionId": "region1"
        },
        {
            "provinceId": "path63",
            "name": "Tidal Sliding Fen",
            "islandId": "default",
            "pathIndex": 10,
            "regionId": "region2"
        },
        {
            "provinceId": "path64",
            "name": "Dualstrike Fields",
            "islandId": "default",
            "pathIndex": 11,
            "regionId": "region2"
        },
        {
            "provinceId": "path65",
            "name": "Windowmere",
            "islandId": "default",
            "pathIndex": 12,
            "regionId": "region2"
        },
        {
            "provinceId": "path66",
            "name": "Slidevale",
            "islandId": "default",
            "pathIndex": 13,
            "regionId": "region2"
        },
        {
            "provinceId": "path68",
            "name": "Pointer's Drift",
            "islandId": "default",
            "pathIndex": 14,
            "regionId": "region2"
        },
        {
            "provinceId": "path69",
            "name": "Riftward Expanse",
            "islandId": "default",
            "pathIndex": 15,
            "regionId": "region2"
        },
        {
            "provinceId": "path72",
            "name": "Index Spire",
            "islandId": "default",
            "pathIndex": 16,
            "regionId": "region3"
        },
        {
            "provinceId": "path73",
            "name": "The Hashforge",
            "islandId": "default",
            "pathIndex": 17,
            "regionId": "region3"
        },
        {
            "provinceId": "path74",
            "name": "Keymount Steppe",
            "islandId": "default",
            "pathIndex": 18,
            "regionId": "region3"
        },
        {
            "provinceId": "path75",
            "name": "Cipher Ridge",
            "islandId": "default",
            "pathIndex": 19,
            "regionId": "region3"
        },
        {
            "provinceId": "path76",
            "name": "Saltwind Coast",
            "islandId": "default",
            "pathIndex": 20,
            "regionId": "region3"
        },
        {
            "provinceId": "path80",
            "name": "Collision Crossing",
            "islandId": "default",
            "pathIndex": 21,
            "regionId": "region3"
        },
        {
            "provinceId": "path79",
            "name": "Bucket Bay",
            "islandId": "default",
            "pathIndex": 22,
            "regionId": "region3"
        },
        {
            "provinceId": "path83",
            "name": "Pushdown Heights",
            "islandId": "default",
            "pathIndex": 23,
            "regionId": "region4"
        },
        {
            "provinceId": "path86",
            "name": "Popfall Hollow",
            "islandId": "default",
            "pathIndex": 24,
            "regionId": "region4"
        },
        {
            "provinceId": "path87",
            "name": "Peaktower Citadel",
            "islandId": "default",
            "pathIndex": 25,
            "regionId": "region4"
        },
        {
            "provinceId": "path89",
            "name": "Lastthrone Plateau",
            "islandId": "default",
            "pathIndex": 26,
            "regionId": "region4"
        },
        {
            "provinceId": "path91",
            "name": "Undarspire",
            "islandId": "default",
            "pathIndex": 27,
            "regionId": "region4"
        }
    ],
    "regions": [
        {
            "regionId": "isle1",
            "topicId": "isle1",
            "name": "Trees",
            "color": mapColors.regions.isle1,
            "provinceIds": [
                "path34",
                "path36"
            ],
            "provinceCount": 2,
            "splitAcrossIslands": false
        },
        {
            "regionId": "isle2",
            "topicId": "isle2",
            "name": "Binary Search",
            "color": mapColors.regions.isle2,
            "provinceIds": [
                "path44",
                "path48",
                "path49"
            ],
            "provinceCount": 3,
            "splitAcrossIslands": false
        },
        {
            "regionId": "isle3",
            "topicId": "isle3",
            "name": "Math",
            "color": mapColors.regions.isle3,
            "provinceIds": [
                "path53"
            ],
            "provinceCount": 1,
            "splitAcrossIslands": false
        },
        {
            "regionId": "region1",
            "topicId": "region1",
            "name": "Linked List",
            "color": mapColors.regions.region1,
            "provinceIds": [
                "path56",
                "path57",
                "path58",
                "path60"
            ],
            "provinceCount": 4,
            "splitAcrossIslands": false
        },
        {
            "regionId": "region2",
            "topicId": "region2",
            "name": "Two Pointers",
            "color": mapColors.regions.region2,
            "provinceIds": [
                "path63",
                "path64",
                "path65",
                "path66",
                "path68",
                "path69"
            ],
            "provinceCount": 6,
            "splitAcrossIslands": false
        },
        {
            "regionId": "region3",
            "topicId": "region3",
            "name": "Arrays & Hashing",
            "color": mapColors.regions.region3,
            "provinceIds": [
                "path72",
                "path73",
                "path74",
                "path75",
                "path76",
                "path80",
                "path79"
            ],
            "provinceCount": 7,
            "splitAcrossIslands": false
        },
        {
            "regionId": "region4",
            "topicId": "region4",
            "name": "Stack",
            "color": mapColors.regions.region4,
            "provinceIds": [
                "path83",
                "path86",
                "path87",
                "path89",
                "path91"
            ],
            "provinceCount": 5,
            "splitAcrossIslands": false
        }
    ]
}
;
