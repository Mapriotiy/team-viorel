import { mapColors } from "./features/lobby-map/mapColors";

export type Region = {
    id: string;
    color: string;
    name: string;
    provinces: string[];
};

// Topics offered when creating a generated map. The default map is itself a
// generated draft (see DEFAULT_MAP_DRAFT) whose regions reuse these ids, so
// there is no separate static REGIONS table anymore.
const REGION_NAMES: Record<string, string> = {
    isle1: 'Trees',
    isle2: 'Binary Search',
    isle3: 'Math',
    region1: 'Linked List',
    region2: 'Two Pointers',
    region3: 'Arrays & Hashing',
    region4: 'Stack',
    region5: 'Dynamic Programming',
    region6: 'String',
    region7: 'Sorting',
};

export const TOPICS: Region[] = Object.entries(mapColors.regions).map(([id, color]) => ({
    id,
    color,
    name: REGION_NAMES[id] ?? id,
    provinces: [],
}));

export const DIFFICULTY_COLORS: Record<string, string> = { ...mapColors.difficulty };
