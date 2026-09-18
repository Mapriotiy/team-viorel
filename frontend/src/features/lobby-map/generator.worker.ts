// Web Worker that runs the (CPU-heavy) map generator off the main thread so the
// map chooser UI never freezes while a draft is generated or its regions are
// reassigned. The generator is a pure async function over serializable data and
// only uses fetch()/import.meta.env (both available in module workers), so it
// runs here unchanged.

import { createGeneratedMapDraft, reassignGeneratedMapRegions } from "./generator";
import type { GeneratedMapDraft, GeneratedMapSize, LobbyMapTopic } from "./types";

// The operation payload without the request id. Kept as its own union so a
// distributive intersection with `{ id }` preserves the discriminated fields
// (Omit<union, "id"> would collapse them).
export type GeneratorOp =
    | { op: "generate"; size: GeneratedMapSize; topics: LobbyMapTopic[] }
    | { op: "reassign"; draft: GeneratedMapDraft; topics: LobbyMapTopic[] };

export type GeneratorRequest = GeneratorOp & { id: number };

export type GeneratorResponse =
    | { id: number; ok: true; draft: GeneratedMapDraft }
    | { id: number; ok: false; error: string };

self.onmessage = async (event: MessageEvent<GeneratorRequest>) => {
    const request = event.data;
    try {
        const draft =
            request.op === "generate"
                ? await createGeneratedMapDraft({ size: request.size, topics: request.topics })
                : await reassignGeneratedMapRegions(request.draft, request.topics);
        const response: GeneratorResponse = { id: request.id, ok: true, draft };
        self.postMessage(response);
    } catch (error) {
        const response: GeneratorResponse = {
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : "Failed to generate map",
        };
        self.postMessage(response);
    }
};
