// Promise-based client for the map generator Web Worker. The worker is created
// lazily on first use and shared across calls; each request is matched to its
// response by id. If Workers aren't available (or fail to construct), we fall
// back to running the generator on the main thread so generation still works.

import { createGeneratedMapDraft, reassignGeneratedMapRegions } from "./generator";
import type { GeneratorOp, GeneratorResponse } from "./generator.worker";
import type { GeneratedMapDraft, GeneratedMapSize, LobbyMapTopic } from "./types";

type Pending = {
    resolve: (draft: GeneratedMapDraft) => void;
    reject: (error: Error) => void;
};

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
    if (workerUnavailable) return null;
    if (worker) return worker;
    if (typeof Worker === "undefined") {
        workerUnavailable = true;
        return null;
    }
    try {
        worker = new Worker(new URL("./generator.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<GeneratorResponse>) => {
            const response = event.data;
            const entry = pending.get(response.id);
            if (!entry) return;
            pending.delete(response.id);
            if (response.ok) {
                entry.resolve(response.draft);
            } else {
                entry.reject(new Error(response.error));
            }
        };
        worker.onerror = () => {
            // Reject everything in flight and stop using the worker; callers can
            // still get results via the main-thread fallback on the next call.
            const error = new Error("Map generator worker crashed");
            pending.forEach((entry) => entry.reject(error));
            pending.clear();
            worker?.terminate();
            worker = null;
            workerUnavailable = true;
        };
        return worker;
    } catch {
        workerUnavailable = true;
        return null;
    }
}

function post(request: GeneratorOp): Promise<GeneratedMapDraft> {
    const activeWorker = getWorker();
    if (!activeWorker) {
        // Main-thread fallback.
        return request.op === "generate"
            ? createGeneratedMapDraft({ size: request.size, topics: request.topics })
            : reassignGeneratedMapRegions(request.draft, request.topics);
    }
    const id = nextRequestId;
    nextRequestId += 1;
    return new Promise<GeneratedMapDraft>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        activeWorker.postMessage({ ...request, id });
    });
}

export function generateMapDraft(opts: {
    size: GeneratedMapSize;
    topics: LobbyMapTopic[];
}): Promise<GeneratedMapDraft> {
    return post({ op: "generate", size: opts.size, topics: opts.topics });
}

export function reassignRegions(
    draft: GeneratedMapDraft,
    topics: LobbyMapTopic[],
): Promise<GeneratedMapDraft> {
    return post({ op: "reassign", draft, topics });
}
