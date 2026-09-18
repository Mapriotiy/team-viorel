import type { GeneratedMapDraft, LobbyMapSelection } from "./types";
import { DEFAULT_MAP_DRAFT } from "./defaultDraft";

export function lobbyMapStorageKey(lobbyId: number) {
    return `lobby-${lobbyId}-map-selection`;
}

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

export function readLobbyMapSelection(lobbyId: number): LobbyMapSelection {
    try {
        const raw = localStorage.getItem(lobbyMapStorageKey(lobbyId));
        if (!raw) return { kind: "generated", draft: DEFAULT_MAP_DRAFT };
        const parsed = JSON.parse(raw) as LobbyMapSelection;
        if (parsed?.kind === "generated" && isGeneratedMapDraft(parsed.draft)) return parsed;
    } catch {}
    return { kind: "generated", draft: DEFAULT_MAP_DRAFT };
}

export function writeLobbyMapSelection(lobbyId: number, selection: LobbyMapSelection) {
    localStorage.setItem(lobbyMapStorageKey(lobbyId), JSON.stringify(selection));
}
