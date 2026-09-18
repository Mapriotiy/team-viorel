import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Pause, Play, RotateCcw } from "lucide-react";
import { apiRequest } from "../api/client";
import { GeneratedMapRenderer } from "../features/lobby-map/GeneratedMapRenderer";
import { normalizeLobbyMapSelection } from "../features/lobby-map/api";
import type { LobbyMapSelection } from "../features/lobby-map/types";

const PLAYER_COLORS = ["#00c2ff", "#ff4d6d", "#ffb020", "#27d980", "#9b7cff", "#4f9cff", "#ff7a59", "#a3e635"];
const STEP_MS = 700;
const PLAYABLE_TYPES = ["capture", "recapture", "defense", "debug_capture", "debug_uncapture"];

type ReplayEvent = {
    id: number;
    province_id: string | null;
    event_type: string;
    actor_user_id: number;
    actor_faction_id: number | null;
};

type ReplayPlayer = {
    user_id: number;
    leetcode_username: string | null;
    faction_id: number | null;
};

type ReplayFaction = {
    id: number;
    name: string;
    color: string;
};

type ReplayProvince = {
    province_id: string;
    captured_by: number | null;
};

type ReplayData = {
    game_mode: string;
    status: string;
    map_selection?: LobbyMapSelection | null;
    provinces: ReplayProvince[];
    events: ReplayEvent[];
    players: ReplayPlayer[];
    factions: ReplayFaction[];
};

function colorForPlayer(userId: number, factions: ReplayFaction[], players: ReplayPlayer[]): string {
    if (factions.length > 0) {
        const player = players.find((p) => p.user_id === userId);
        if (player?.faction_id != null) {
            return factions.find((f) => f.id === player.faction_id)?.color ?? "#888";
        }
    }
    const index = players.findIndex((p) => p.user_id === userId);
    return PLAYER_COLORS[index >= 0 ? index % PLAYER_COLORS.length : 0];
}

export function ReplayPage({ replayToken }: { replayToken: string }) {
    const [data, setData] = useState<ReplayData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [captured, setCaptured] = useState<Map<string, string>>(new Map());
    const [playing, setPlaying] = useState(false);
    const [step, setStep] = useState(0);

    useEffect(() => {
        apiRequest<ReplayData>(`/lobbies/replay/${encodeURIComponent(replayToken)}`)
            .then(setData)
            .catch((e) => setError(e instanceof Error ? e.message : "Failed to load replay"));
    }, [replayToken]);

    const factions = data?.factions ?? [];
    const players = data?.players ?? [];

    const playableEvents = useMemo(
        () =>
            (data?.events ?? []).filter(
                (event) => event.province_id && PLAYABLE_TYPES.includes(event.event_type),
            ),
        [data],
    );

    // Final map state, in case the event timeline is sparse (e.g. debug wins).
    const finalCaptured = useMemo(() => {
        const map = new Map<string, string>();
        for (const province of data?.provinces ?? []) {
            if (province.captured_by == null) continue;
            map.set(province.province_id, colorForPlayer(province.captured_by, factions, players));
        }
        return map;
    }, [data, factions, players]);

    const mapSelection = useMemo(
        () => normalizeLobbyMapSelection(data?.map_selection ?? null),
        [data],
    );

    const applyEvent = useCallback(
        (map: Map<string, string>, event: ReplayEvent) => {
            if (!event.province_id) return;
            const next = new Map(map);
            if (event.event_type === "debug_uncapture") {
                next.delete(event.province_id);
            } else {
                next.set(event.province_id, colorForPlayer(event.actor_user_id, factions, players));
            }
            return next;
        },
        [factions, players],
    );

    const applyUpTo = useCallback(
        (count: number) => {
            let map = new Map<string, string>();
            const limit = Math.min(count, playableEvents.length);
            for (let i = 0; i < limit; i += 1) {
                map = applyEvent(map, playableEvents[i]) ?? map;
            }
            setCaptured(map);
        },
        [playableEvents, applyEvent],
    );

    // Start from the final map when there is nothing to replay (debug-only games).
    useEffect(() => {
        if (data && playableEvents.length === 0) {
            setCaptured(finalCaptured);
        }
    }, [data, playableEvents, finalCaptured]);

    useEffect(() => {
        if (!playing) return;
        if (step >= playableEvents.length) {
            setPlaying(false);
            setCaptured(finalCaptured);
            return;
        }
        const timer = window.setTimeout(() => {
            setCaptured((prev) => applyEvent(prev, playableEvents[step]) ?? prev);
            setStep((value) => value + 1);
        }, STEP_MS);
        return () => window.clearTimeout(timer);
    }, [playing, step, playableEvents, applyEvent, finalCaptured]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            /* ignore */
        }
    };

    if (error) {
        return (
            <main className="min-h-screen bg-[#14110f] p-6 text-[#f4e7d8]">
                <p className="mx-auto max-w-md rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
                    {error}
                </p>
            </main>
        );
    }

    if (!data) {
        return <main className="min-h-screen bg-[#14110f] p-6 text-center text-[#8f8278]">Loading replay…</main>;
    }

    const progress = playableEvents.length > 0 ? step / playableEvents.length : 1;

    return (
        <main className="min-h-screen bg-[#14110f] p-4 text-[#f4e7d8] sm:p-6">
            <div className="mx-auto max-w-6xl">
                <header className="flex flex-col gap-4 border-b border-[#332b25] pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <a
                            href={window.location.pathname}
                            className="grid h-10 w-10 place-items-center rounded-md border border-[#3f332d] text-[#a8917d] transition hover:border-[#d9b887] hover:text-[#f4e7d8]"
                        >
                            <ArrowLeft size={20} />
                        </a>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d9b887]">Replay</p>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Match replay</h1>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleCopy()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#4c4238] bg-transparent px-4 text-sm font-medium text-[#d9c5ad] transition hover:border-[#d9b887] hover:text-[#f4e7d8]"
                    >
                        <Copy size={16} />
                        {copied ? "Copied!" : "Copy replay link"}
                    </button>
                </header>

                <section className="relative mt-6 overflow-hidden rounded-xl border border-[#3f332d] bg-[#211a16] p-3 sm:p-4">
                    <GeneratedMapRenderer
                        draft={mapSelection.draft}
                        captured={captured}
                        zoomable
                        onSelect={() => {}}
                    />

                    <div className="mt-4 border-t border-[#2a2a2a] pt-3">
                        <div
                            className="group h-1.5 cursor-pointer overflow-hidden rounded-full bg-[#332b25]"
                            onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                                const target = Math.round(ratio * playableEvents.length);
                                setStep(target);
                                applyUpTo(target);
                            }}
                        >
                            <div
                                className="h-full rounded-full bg-[#d9b887] transition-all"
                                style={{ width: `${progress * 100}%` }}
                            />
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (step >= playableEvents.length) {
                                        setStep(0);
                                        setCaptured(new Map());
                                    }
                                    setPlaying((value) => !value);
                                }}
                                className="grid h-9 w-9 place-items-center rounded-md border border-[#4c4238] bg-transparent text-[#d9c5ad] transition hover:border-[#d9b887] hover:text-[#f4e7d8]"
                                aria-label={playing ? "Pause" : "Play"}
                            >
                                {playing ? <Pause size={16} /> : <Play size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setPlaying(false);
                                    setStep(0);
                                    setCaptured(new Map());
                                }}
                                className="grid h-9 w-9 place-items-center rounded-md border border-[#4c4238] bg-transparent text-[#d9c5ad] transition hover:border-[#d9b887] hover:text-[#f4e7d8]"
                                aria-label="Restart"
                            >
                                <RotateCcw size={15} />
                            </button>
                            <span className="text-xs tabular-nums text-[#8f8278]">
                                {playableEvents.length > 0 ? `${step}/${playableEvents.length} captures` : "No capture events"}
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
