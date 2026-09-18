// Lightweight stale-while-revalidate cache backed by localStorage.
//
// Callers seed their UI state from readCache() on mount so the last-seen data
// paints instantly, then refresh over the network and writeCache() the result.
// Every key is versioned: bumping the version on a schema change drops any
// previously stored (now stale-shaped) value instead of rendering it.

const CACHE_PREFIX = "cache:";

type CacheEnvelope<T> = {
    v: number;
    savedAt: number;
    data: T;
};

export type CachedValue<T> = {
    data: T;
    savedAt: number;
};

export function readCache<T>(key: string, version: number): CachedValue<T> | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const envelope = JSON.parse(raw) as Partial<CacheEnvelope<T>>;
        if (
            !envelope ||
            envelope.v !== version ||
            typeof envelope.savedAt !== "number" ||
            envelope.data === undefined
        ) {
            return null;
        }
        return { data: envelope.data as T, savedAt: envelope.savedAt };
    } catch {
        return null;
    }
}

export function writeCache<T>(key: string, version: number, data: T): void {
    try {
        const envelope: CacheEnvelope<T> = { v: version, savedAt: Date.now(), data };
        localStorage.setItem(key, JSON.stringify(envelope));
    } catch {
        // Ignore quota / serialization errors — the cache is best-effort.
    }
}

// Remove one specific key, or (with no argument) every cache entry. Called on
// logout so a different account on the same browser never reads stale menus.
export function clearCache(key?: string): void {
    try {
        if (key) {
            localStorage.removeItem(key);
            return;
        }
        const stale: string[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const storageKey = localStorage.key(i);
            if (storageKey && storageKey.startsWith(CACHE_PREFIX)) {
                stale.push(storageKey);
            }
        }
        stale.forEach((storageKey) => localStorage.removeItem(storageKey));
    } catch {
        // Ignore — best-effort cleanup.
    }
}

export function dashboardCacheKey(userId: number): string {
    return `${CACHE_PREFIX}dashboard:${userId}`;
}

export function lobbyCacheKey(lobbyId: number): string {
    return `${CACHE_PREFIX}lobby:${lobbyId}`;
}
