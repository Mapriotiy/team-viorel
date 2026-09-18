import { apiRequest } from "../../api/client";
import { DEFAULT_MAP_DRAFT } from "./defaultDraft";
import type { GeneratedMapDraft, LobbyMapSelection } from "./types";

type LobbyMapSelectionResponse = {
    selection: unknown;
};

function isGeneratedMapDraft(value: unknown): value is GeneratedMapDraft {
    if (!value || typeof value !== "object") return false;
    const draft = value as Partial<GeneratedMapDraft>;
    return (
        draft.schemaVersion === 1 &&
        Array.isArray(draft.islands) &&
        Array.isArray(draft.provinces) &&
        Array.isArray(draft.regions) &&
        typeof draft.seaBaseSrc === "string"
    );
}

export function normalizeLobbyMapSelection(value: unknown): LobbyMapSelection {
    if (!value || typeof value !== "object") {
        return { kind: "generated", draft: DEFAULT_MAP_DRAFT };
    }
    const selection = value as Partial<LobbyMapSelection>;
    if (selection.kind === "generated" && isGeneratedMapDraft(selection.draft)) {
        return { kind: "generated", draft: selection.draft };
    }
    // Legacy "default" selections (and anything else) resolve to the canonical
    // default draft so there is a single generated-map pipeline everywhere.
    return { kind: "generated", draft: DEFAULT_MAP_DRAFT };
}

export async function fetchLobbyMapSelection(lobbyId: number): Promise<LobbyMapSelection> {
    const data = await apiRequest<LobbyMapSelectionResponse>(`/lobbies/${lobbyId}/map-selection`);
    return normalizeLobbyMapSelection(data.selection);
}

export async function saveLobbyMapSelection(
    lobbyId: number,
    selection: LobbyMapSelection,
): Promise<LobbyMapSelection> {
    const data = await apiRequest<LobbyMapSelectionResponse>(`/lobbies/${lobbyId}/map-selection`, {
        method: "PUT",
        body: JSON.stringify(selection),
    });
    return normalizeLobbyMapSelection(data.selection);
}

export type MapPreset = {
    id: number;
    name: string;
    draft: GeneratedMapDraft;
};

type MapPresetResponse = {
    id: number;
    name: string;
    draft: unknown;
    created_at: string;
};

// Drop any server row whose stored draft no longer matches the current schema
// rather than rendering a malformed preset.
function toMapPreset(row: MapPresetResponse): MapPreset | null {
    if (!isGeneratedMapDraft(row.draft)) return null;
    return { id: row.id, name: row.name, draft: row.draft };
}

export async function listMapPresets(): Promise<MapPreset[]> {
    const rows = await apiRequest<MapPresetResponse[]>("/map-presets/");
    return rows.map(toMapPreset).filter((preset): preset is MapPreset => preset !== null);
}

export async function createMapPreset(name: string, draft: GeneratedMapDraft): Promise<MapPreset> {
    const row = await apiRequest<MapPresetResponse>("/map-presets/", {
        method: "POST",
        body: JSON.stringify({ name, draft }),
    });
    const preset = toMapPreset(row);
    if (!preset) throw new Error("Saved preset is invalid");
    return preset;
}

export async function deleteMapPreset(id: number): Promise<void> {
    await apiRequest<void>(`/map-presets/${id}`, { method: "DELETE" });
}
