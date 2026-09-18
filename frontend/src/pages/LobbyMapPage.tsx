import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, HelpCircle, LogOut, ScrollText, UserPlus, X } from 'lucide-react';
import ProvincePopup from '../components/ProvincePopup';
import { WinnerOverlay } from '../components/WinnerOverlay';
import { EventLogPanel } from '../components/map/EventLogPanel';
import { Footer } from '../components/Footer';
import { HowToPlayModal } from '../components/map/HowToPlayModal';
import { MapLegend } from '../components/map/MapLegend';
import { apiRequest } from '../api/client';
import { useLobbyEvents } from '../hooks/useLobbyEvents';
import { GeneratedMapRenderer } from '../features/lobby-map/GeneratedMapRenderer';
import { PowerUpInventory, type PowerUpKind } from '../components/powerups/PowerUpInventory';
import { DebugPanel } from '../components/debug/DebugPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { generatedRegionsAsLegend } from '../features/lobby-map/generator';
import { DEFAULT_MAP_DRAFT } from '../features/lobby-map/defaultDraft';
import { mapColors } from '../features/lobby-map/mapColors';
import { writeLobbyMapSelection } from '../features/lobby-map/storage';
import { normalizeLobbyMapSelection } from '../features/lobby-map/api';
import type { LobbyMapSelection } from '../features/lobby-map/types';

const FACTION_COLORS = mapColors.factions;

type ProvinceData = {
    province_id: string;
    region_id: string;
    province_name?: string | null;
    region_name?: string | null;
    problem: { title: string; title_slug: string; difficulty: string; url: string } | null;
    captured_by: number | null;
    captured_by_username: string | null;
    captured_at: string | null;
    captured_runtime_ms: number | null;
    captured_submission_url: string | null;
    capturer_leetcode_username: string | null;
    first_captured_by: number | null;
    fortified_until: string | null;
};

type ScoreEntry = {
    team_id: number;
    label: string;
    color: string;
    provinces: number;
    base_points: number;
    bonus_points: number;
    region_control_points: number;
    total_points: number;
};

type WinnerInfo = {
    winner_user_id: number | null;
    winner_faction_id: number | null;
    label: string | null;
};

type MapApiResponse = {
    lobby_id: number;
    map_selection?: LobbyMapSelection | null;
    status: string;
    winner: WinnerInfo | null;
    provinces: ProvinceData[];
    score: ScoreEntry[];
    powerups?: Record<number, Record<string, number>> | null;
    win_target?: number | null;
};

type SyncApiResponse = MapApiResponse & {
    captured_count: number;
    recaptured_count: number;
};

type LobbyPlayer = {
    user_id: number;
    leetcode_username: string | null;
    faction_id: number | null;
    status: string;
};

type Faction = {
    id: number;
    name: string;
    color: string;
};

type LobbyMapPageProps = {
    lobbyId: number;
    currentUserId: number;
    players: LobbyPlayer[];
    factions: Faction[];
    isAdmin: boolean;
    onBack: () => void;
    onReplay: () => void;
    onLeft: () => void;
};

const STATE_POLL_INTERVAL_MS = 7_500;
const SYNC_INTERVAL_MS = 60_000;
const SYNC_JITTER_MS = 15_000;

export function LobbyMapPage({ lobbyId, currentUserId, players, factions, isAdmin, onBack, onReplay, onLeft }: LobbyMapPageProps) {
    const [provincesData, setProvincesData] = useState<ProvinceData[]>([]);
    const [scoreEntries, setScoreEntries] = useState<ScoreEntry[]>([]);
    const [gameStatus, setGameStatus] = useState<string>('active');
    const [winner, setWinner] = useState<WinnerInfo | null>(null);
    const [winTarget, setWinTarget] = useState<number | null>(null);
    const [syncTick, setSyncTick] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isLeaving, setIsLeaving] = useState(false);
    const [leaveError, setLeaveError] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
    const [popPos, setPopPos] = useState<{ x: number; y: number } | null>(null);
    const [hoveredProvinces, setHoveredProvinces] = useState<string[] | null>(null);
    const [mapSelection, setMapSelection] = useState<LobbyMapSelection>({ kind: 'generated', draft: DEFAULT_MAP_DRAFT });
    const [powerups, setPowerups] = useState<Record<number, Record<string, number>>>({});
    const [powerupError, setPowerupError] = useState<string | null>(null);
    const [armedPowerup, setArmedPowerup] = useState<PowerUpKind | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [leftPlayers, setLeftPlayers] = useState<LobbyPlayer[]>([]);
    const [reinvitingUserId, setReinvitingUserId] = useState<number | null>(null);
    const [lobbyInfo, setLobbyInfo] = useState<{ left_players: LobbyPlayer[]; players: LobbyPlayer[]; max_players: number; faction_mode: boolean } | null>(null);
    const [friends, setFriends] = useState<{ friendship_id: number; friend: { id: number; leetcode_username: string | null } }[]>([]);
    const [showAddPlayer, setShowAddPlayer] = useState(false);
    const [showMobileLog, setShowMobileLog] = useState(false);
    const [factionChoiceByUser, setFactionChoiceByUser] = useState<Record<number, number>>({});
    const [bursts, setBursts] = useState<Map<string, string>>(new Map());
    const prevOwnersRef = useRef<Map<string, number | null>>(new Map());
    const loadedRef = useRef(false);

    const debugEnabled =
        isAdmin && (() => {
            try {
                return localStorage.getItem('mapcode.debugMode') === '1';
            } catch {
                return false;
            }
        })();

    useEffect(() => {
        setMapSelection({ kind: 'generated', draft: DEFAULT_MAP_DRAFT });
        setHoveredProvinces(null);
        setSelectedProvince(null);
        setPopPos(null);
    }, [lobbyId]);

    const factionByPlayer = useMemo(() => {
        const map = new Map<number, number>();
        for (const p of players) {
            if (p.faction_id) map.set(p.user_id, p.faction_id);
        }
        return map;
    }, [players]);

    const factionById = useMemo(() => {
        const map = new Map<number, Faction>();
        for (const faction of factions) {
            map.set(faction.id, faction);
        }
        return map;
    }, [factions]);

    const displayedProvincesData = useMemo(() => {
        const generatedIds = new Set(mapSelection.draft.provinces.map((province) => province.provinceId));
        if (provincesData.some((province) => generatedIds.has(province.province_id))) {
            return provincesData;
        }

        return mapSelection.draft.provinces.map((generatedProvince, index) => {
            const source = provincesData[index] ?? null;
            return {
                province_id: generatedProvince.provinceId,
                region_id: generatedProvince.regionId,
                province_name: generatedProvince.name,
                region_name: mapSelection.draft.regions.find((region) => region.regionId === generatedProvince.regionId)?.name ?? null,
                problem: source?.problem ?? null,
                captured_by: source?.captured_by ?? null,
                captured_by_username: source?.captured_by_username ?? null,
                captured_at: source?.captured_at ?? null,
                captured_runtime_ms: source?.captured_runtime_ms ?? null,
                captured_submission_url: source?.captured_submission_url ?? null,
                capturer_leetcode_username: source?.capturer_leetcode_username ?? null,
                first_captured_by: source?.first_captured_by ?? null,
                fortified_until: source?.fortified_until ?? null,
            } satisfies ProvinceData;
        });
    }, [mapSelection, provincesData]);

    const captured = useMemo(() => {
        const map = new Map<string, string>();
        for (const p of displayedProvincesData) {
            if (!p.captured_by) continue;
            const fid = factionByPlayer.get(p.captured_by) ?? 0;
            const faction = factionById.get(fid);
            if (faction) {
                map.set(p.province_id, faction.color);
            } else if (fid > 0 && fid <= FACTION_COLORS.length) {
                map.set(p.province_id, FACTION_COLORS[fid - 1]);
            } else {
                map.set(p.province_id, mapColors.unknownOwner);
            }
        }
        return map;
    }, [displayedProvincesData, factionByPlayer, factionById]);

    const legendRegions = useMemo(
        () => generatedRegionsAsLegend(mapSelection.draft),
        [mapSelection],
    );

    const ownerColor = useCallback((userId: number | null, factionId?: number | null): string | undefined => {
        if (!userId) return undefined;
        const fid = factionId ?? factionByPlayer.get(userId) ?? 0;
        const faction = factionById.get(fid);
        if (faction) return faction.color;
        if (fid > 0 && fid <= FACTION_COLORS.length) return FACTION_COLORS[fid - 1];
        return mapColors.unknownOwner;
    }, [factionByPlayer, factionById]);

    // Live captures pushed over SSE are applied on top of the server-derived
    // state so the map reacts instantly; the next poll reconciles anyway.
    const appliedEventIdsRef = useRef<Set<number>>(new Set());
    const mapRequestIdRef = useRef(0);

    // The map snapshot is authoritative. SSE drives only transient effects;
    // painting from an optimistic event can color an actually-free province.
    const displayCaptured = captured;

    const { events } = useLobbyEvents(lobbyId, syncTick);

    useEffect(() => {
        for (const event of events) {
            if (appliedEventIdsRef.current.has(event.id)) continue;
            if (!event.province_id) continue;

            if (event.event_type === 'defense') {
                appliedEventIdsRef.current.add(event.id);
                continue;
            }

            if (
                event.event_type === 'capture' ||
                event.event_type === 'recapture' ||
                event.event_type === 'debug_capture'
            ) {
                appliedEventIdsRef.current.add(event.id);
                const color = ownerColor(event.actor_user_id, event.actor_faction_id);
                if (!color) continue;
                const provinceId = event.province_id;
                setBursts((prev) => {
                    const next = new Map(prev);
                    next.set(provinceId, color);
                    return next;
                });
                window.setTimeout(() => {
                    setBursts((prev) => {
                        const next = new Map(prev);
                        next.delete(provinceId);
                        return next;
                    });
                }, 1200);
            }

            if (event.event_type === 'debug_uncapture') {
                appliedEventIdsRef.current.add(event.id);
            }
        }
    }, [events, ownerColor]);

    const applyMapData = useCallback((data: MapApiResponse) => {
        const serverSelection = normalizeLobbyMapSelection(data.map_selection);
        setMapSelection(serverSelection);
        writeLobbyMapSelection(lobbyId, serverSelection);
        if (data.provinces.length > 0) setProvincesData(data.provinces);

        const nowOwners = new Map<string, number | null>();
        const nextBursts: Array<[string, string]> = [];
        for (const p of data.provinces) {
            nowOwners.set(p.province_id, p.captured_by);
            if (!loadedRef.current) continue;
            const prev = prevOwnersRef.current.get(p.province_id);
            if (p.captured_by != null && p.captured_by !== prev) {
                const color = ownerColor(p.captured_by);
                if (color) nextBursts.push([p.province_id, color]);
            }
        }
        prevOwnersRef.current = nowOwners;
        loadedRef.current = true;

        if (nextBursts.length > 0) {
            setBursts((prev) => {
                const next = new Map(prev);
                for (const [id, color] of nextBursts) next.set(id, color);
                return next;
            });
            const ids = nextBursts.map(([id]) => id);
            window.setTimeout(() => {
                setBursts((prev) => {
                    const next = new Map(prev);
                    for (const id of ids) next.delete(id);
                    return next;
                });
            }, 1000);
        }

        setScoreEntries(data.score ?? []);
        setGameStatus(data.status);
        setWinner(data.winner ?? null);
        setWinTarget(data.win_target ?? null);
        setPowerups(data.powerups ?? {});
    }, [lobbyId, ownerColor]);

    const loadMap = useCallback(async () => {
        const requestId = ++mapRequestIdRef.current;
        try {
            const data = await apiRequest<MapApiResponse>(`/lobbies/${lobbyId}/map`);
            if (requestId !== mapRequestIdRef.current) return;
            applyMapData(data);
        } catch (e) {
            console.error(e);
        }
    }, [lobbyId, applyMapData]);

    const sync = useCallback(async () => {
        const requestId = ++mapRequestIdRef.current;
        try {
            const data = await apiRequest<SyncApiResponse>(
                `/lobbies/${lobbyId}/map/sync`, { method: 'POST' }
            );
            if (requestId !== mapRequestIdRef.current) return;
            applyMapData(data);
            setSyncTick((tick) => tick + 1);
        } catch (e) {
            console.error(e);
        }
    }, [lobbyId, applyMapData]);

    const usePowerup = useCallback(async (kind: string, provinceId: string) => {
        setPowerupError(null);
        try {
            const data = await apiRequest<MapApiResponse>(
                `/lobbies/${lobbyId}/provinces/${provinceId}/${kind}`,
                { method: 'POST' },
            );
            applyMapData(data);
        } catch (e) {
            setPowerupError(e instanceof Error ? e.message : 'Failed to use power-up');
            throw e;
        }
    }, [lobbyId, applyMapData]);

    useEffect(() => {
        setLoading(true);
        loadMap()
            .then(() => sync())
            .finally(() => setLoading(false));
    }, [loadMap, sync]);

    type LobbyInfo = {
        left_players: LobbyPlayer[];
        players: LobbyPlayer[];
        max_players: number;
        faction_mode: boolean;
    };

    const loadLobbyInfo = useCallback(async () => {
        try {
            const data = await apiRequest<LobbyInfo>(`/lobbies/${lobbyId}`);
            setLobbyInfo(data);
            setLeftPlayers(data.left_players ?? []);
        } catch (e) {
            console.error(e);
        }
    }, [lobbyId]);

    useEffect(() => {
        loadLobbyInfo();
        apiRequest<{ friendship_id: number; friend: { id: number; leetcode_username: string | null } }[]>(
            '/friends/',
        )
            .then(setFriends)
            .catch(() => {});
        const interval = setInterval(() => void loadLobbyInfo(), 5000);
        return () => clearInterval(interval);
    }, [loadLobbyInfo]);

    const handleInvitePlayer = useCallback(async (userId: number, factionId?: number | null) => {
        setReinvitingUserId(userId);
        try {
            const data = await apiRequest<LobbyInfo>(`/lobbies/${lobbyId}/invite-user`, {
                method: 'POST',
                body: JSON.stringify({ user_id: userId, ...(factionId ? { faction_id: factionId } : {}) }),
            });
            setLobbyInfo(data);
            setLeftPlayers(data.left_players ?? []);
            setFactionChoiceByUser((prev) => {
                const next = { ...prev };
                delete next[userId];
                return next;
            });
        } catch (e) {
            console.error(e);
        } finally {
            setReinvitingUserId(null);
        }
    }, [lobbyId]);

    useEffect(() => {
        if (gameStatus === 'finished') return;
        const interval = setInterval(loadMap, STATE_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [loadMap, gameStatus]);

    useEffect(() => {
        if (gameStatus === 'finished') return;
        let timeoutId: number | null = null;
        let isActive = true;

        function scheduleSync() {
            if (!isActive) return;
            const delay = SYNC_INTERVAL_MS + Math.floor(Math.random() * SYNC_JITTER_MS);
            timeoutId = window.setTimeout(() => {
                void sync().finally(() => {
                    if (isActive) scheduleSync();
                });
            }, delay);
        }

        scheduleSync();

        return () => {
            isActive = false;
            if (timeoutId !== null) window.clearTimeout(timeoutId);
        };
    }, [sync, gameStatus]);

    const handleSelect = useCallback((id: string, pos: { x: number; y: number }) => {
        if (armedPowerup) {
            const clicked = displayedProvincesData.find((p) => p.province_id === id);
            const owner: 'player' | 'enemy' | undefined = (() => {
                if (!clicked?.captured_by) return undefined;
                if (clicked.captured_by === currentUserId) return 'player';
                const myFaction = factionByPlayer.get(currentUserId);
                if (myFaction != null && factionByPlayer.get(clicked.captured_by) === myFaction) {
                    return 'player';
                }
                return 'enemy';
            })();
            const valid =
                (armedPowerup === 'reroll' && owner === undefined) ||
                (armedPowerup === 'fortify' && owner === 'player') ||
                (armedPowerup === 'siege' && owner === undefined);
            if (!valid) {
                setPowerupError('This power-up cannot be used on that province');
                return;
            }
            const kind = armedPowerup;
            setArmedPowerup(null);
            void usePowerup(kind, id).catch(() => {});
            return;
        }
        setSelectedProvince(id);
        setPopPos(pos);
    }, [armedPowerup, displayedProvincesData, factionByPlayer, currentUserId, usePowerup]);

    const handleClose = useCallback(() => {
        setSelectedProvince(null);
        setPopPos(null);
    }, []);

    const handleLeave = useCallback(async () => {
        setIsLeaving(true);
        setLeaveError(null);
        try {
            await apiRequest(`/lobbies/${lobbyId}/leave`, { method: 'DELETE' });
            onLeft();
        } catch (e) {
            setLeaveError(e instanceof Error ? e.message : 'Failed to leave lobby');
        } finally {
            setIsLeaving(false);
        }
    }, [lobbyId, onLeft]);

    const selectedGeneratedProvince =
        selectedProvince ? mapSelection.draft.provinces.find((p) => p.provinceId === selectedProvince) ?? null : null;

    const selectedProvinceData = selectedProvince
        ? displayedProvincesData.find((p) => p.province_id === selectedProvince) ??
          ({
                province_id: selectedProvince,
                region_id: selectedGeneratedProvince?.regionId ?? '',
                province_name: selectedGeneratedProvince?.name ?? null,
                region_name:
                    mapSelection.draft.regions.find((region) => region.regionId === selectedGeneratedProvince?.regionId)?.name ?? null,
                problem: null,
                captured_by: null,
                captured_by_username: null,
                captured_at: null,
                captured_runtime_ms: null,
                captured_submission_url: null,
                capturer_leetcode_username: null,
                first_captured_by: null,
                fortified_until: null,
            } satisfies ProvinceData)
        : null;

    const myFactionId = factionByPlayer.get(currentUserId);
    const isSameTeam = (userId: number | null) => {
        if (!userId) return false;
        if (userId === currentUserId) return true;
        return myFactionId != null && factionByPlayer.get(userId) === myFactionId;
    };

    const owner = selectedProvinceData?.captured_by
        ? isSameTeam(selectedProvinceData.captured_by)
            ? 'player'
            : 'enemy'
        : undefined;

    const firstCaptureOwner = selectedProvinceData?.first_captured_by
        ? isSameTeam(selectedProvinceData.first_captured_by)
            ? ('player' as const)
            : ('enemy' as const)
        : undefined;

    const myPowerups = powerups[currentUserId] ?? { reroll: 0, fortify: 0, siege: 0 };
    const selectedFortified =
        selectedProvinceData?.fortified_until != null &&
        new Date(selectedProvinceData.fortified_until).getTime() > Date.now();

    const inGameIds = useMemo(() => new Set((lobbyInfo?.players ?? []).map((p) => p.user_id)), [lobbyInfo]);
    const leftIds = useMemo(() => new Set(leftPlayers.map((p) => p.user_id)), [leftPlayers]);
    const invitableFriends = useMemo(
        () => friends.filter((f) => !inGameIds.has(f.friend.id) && !leftIds.has(f.friend.id)),
        [friends, inGameIds, leftIds],
    );
    const hasSlots = lobbyInfo ? lobbyInfo.faction_mode || lobbyInfo.max_players > (lobbyInfo.players?.length ?? 0) : true;
    const slotLabel = lobbyInfo && !lobbyInfo.faction_mode
        ? `${(lobbyInfo.players?.length ?? 0)}/${lobbyInfo.max_players}`
        : null;

    const factionCounts = useMemo(() => {
        const counts = new Map<number, number>();
        for (const p of lobbyInfo?.players ?? []) {
            if (p.faction_id) counts.set(p.faction_id, (counts.get(p.faction_id) ?? 0) + 1);
        }
        return counts;
    }, [lobbyInfo]);
    const defaultFactionId = useMemo(() => {
        if (!lobbyInfo?.faction_mode || factions.length === 0) return null;
        return [...factions].sort(
            (a, b) => (factionCounts.get(a.id) ?? 0) - (factionCounts.get(b.id) ?? 0),
        )[0].id;
    }, [lobbyInfo, factions, factionCounts]);

    const fortifiedIds = useMemo(
        () =>
            new Set(
                displayedProvincesData
                    .filter(
                        (p) =>
                            p.fortified_until != null &&
                            new Date(p.fortified_until).getTime() > Date.now(),
                    )
                    .map((p) => p.province_id),
            ),
        [displayedProvincesData],
    );

    const winnerAccent = useMemo(() => {
        if (!winner) return '#e6a15d';
        if (winner.winner_faction_id != null) {
            return factionById.get(winner.winner_faction_id)?.color ?? '#e6a15d';
        }
        if (winner.winner_user_id != null) {
            const fid = factionByPlayer.get(winner.winner_user_id) ?? 0;
            return factionById.get(fid)?.color ?? FACTION_COLORS[fid - 1] ?? '#e6a15d';
        }
        return '#e6a15d';
    }, [winner, factionById, factionByPlayer]);

    const youWon =
        winner?.winner_user_id != null && winner.winner_user_id === currentUserId
            ? true
            : winner?.winner_faction_id != null &&
                factionByPlayer.get(currentUserId) === winner.winner_faction_id;

    const neutralCount = displayedProvincesData.filter((p) => !p.captured_by).length;
    const totalCount = displayedProvincesData.length;
    const scoreRows = scoreEntries.map((entry) => {
        const breakdown = [
            `${entry.base_points} flags`,
            entry.bonus_points > 0 ? `+${entry.bonus_points} first captures` : null,
            entry.region_control_points > 0 ? `+${entry.region_control_points} region control` : null,
        ].filter(Boolean).join(', ');
        return {
            key: entry.team_id,
            label: entry.label,
            color: entry.color,
            count: entry.provinces,
            points: entry.total_points,
            regionControlPoints: entry.region_control_points,
            breakdown,
        };
    });
    const winnerScoreRow = (() => {
        if (!winner) return null;
        if (winner.winner_faction_id != null) {
            return scoreRows.find((row) => row.key === winner.winner_faction_id) ?? null;
        }
        if (winner.winner_user_id != null) {
            return scoreRows.find((row) => row.key === winner.winner_user_id) ?? null;
        }

        const leaderPoints = Math.max(0, ...scoreRows.map((row) => row.points));
        return scoreRows.find((row) => row.points === leaderPoints) ?? null;
    })();

    return (
        <main className="min-h-screen bg-transparent p-2.5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-white sm:p-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-6">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={onBack}
                            className="grid h-10 w-10 place-items-center rounded-md border border-[#3f332d] bg-[#211a16] text-[#a8917d] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d]"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Lobby Map</h1>
                            <p className="mt-0.5 text-xs text-[#8f8278] sm:mt-1 sm:text-sm">Capture provinces by solving problems</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {gameStatus !== 'finished' && (invitableFriends.length > 0 || leftPlayers.length > 0) && (
                            <button
                                type="button"
                                onClick={() => setShowAddPlayer((v) => !v)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#e6a15d]/50 bg-[#e6a15d]/10 px-3 text-sm font-medium text-[#e8b691] transition hover:bg-[#e6a15d]/20"
                            >
                                <UserPlus size={16} />
                                Add player
                                {slotLabel ? ` (${slotLabel})` : ''}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowHelp(true)}
                            title="How to play"
                            aria-label="How to play"
                            className="grid h-10 w-10 place-items-center rounded-md border border-[#3f332d] bg-[#211a16] text-[#a8917d] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d]"
                        >
                            <HelpCircle size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirmLeave(true)}
                            disabled={isLeaving}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#3f332d] bg-[#211a16] px-3 text-sm font-medium text-[#d9c5ad] transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:border-[#3f332d] disabled:bg-[#211a16] disabled:text-[#777] sm:px-4"
                        >
                            <LogOut size={16} />
                            <span className="hidden sm:inline">{isLeaving ? 'Leaving...' : 'Leave Lobby'}</span>
                            <span className="sm:hidden">{isLeaving ? '...' : 'Leave'}</span>
                        </button>
                    </div>
                </header>
                {powerupError && (
                    <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {powerupError}
                    </p>
                )}
                {leaveError && (
                    <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {leaveError}
                    </p>
                )}

                {showAddPlayer && (
                    <section className="mt-4 rounded-lg border border-[#3f332d] bg-[#211a16] p-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-[#d9c5ad]">Add players</h2>
                            <button
                                type="button"
                                onClick={() => setShowAddPlayer(false)}
                                className="text-xs text-[#8f8278] transition hover:text-[#d9c5ad]"
                            >
                                Close
                            </button>
                        </div>
                        {slotLabel && (
                            <p className="mt-1 text-xs text-[#8f8278]">Players: {slotLabel}</p>
                        )}
                        {!hasSlots && (
                            <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                Lobby is full — no free slots.
                            </p>
                        )}
                        {leftPlayers.length > 0 && (
                            <div className="mt-3">
                                <p className="text-xs font-medium text-[#8f8278]">Recently left</p>
                                <ul className="mt-2 grid gap-2">
                                    {leftPlayers.map((player) => {
                                        const chosenFaction = factionChoiceByUser[player.user_id] ?? defaultFactionId;
                                        return (
                                            <li
                                                key={player.user_id}
                                                className="flex items-center gap-3 rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm"
                                            >
                                                <span className="text-[#a8917d]">
                                                    {player.leetcode_username ?? `User #${player.user_id}`}
                                                </span>
                                                {lobbyInfo?.faction_mode && factions.length > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        {factions.map((faction) => (
                                                            <button
                                                                key={faction.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    setFactionChoiceByUser((prev) => ({
                                                                        ...prev,
                                                                        [player.user_id]: faction.id,
                                                                    }))
                                                                }
                                                                title={`${faction.name} faction`}
                                                                className={`h-4 w-4 rounded-full transition ${
                                                                    chosenFaction === faction.id
                                                                        ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-[#1b1512]'
                                                                        : 'opacity-50 hover:opacity-100'
                                                                }`}
                                                                style={{ backgroundColor: faction.color }}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => void handleInvitePlayer(player.user_id, chosenFaction)}
                                                    disabled={reinvitingUserId === player.user_id || !hasSlots}
                                                    className="ml-auto rounded-md border border-[#e6a15d]/50 bg-[#e6a15d]/10 px-3 py-1 text-xs font-medium text-[#e8b691] transition hover:bg-[#e6a15d]/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {reinvitingUserId === player.user_id ? 'Adding...' : 'Re-invite'}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                        {invitableFriends.length > 0 && (
                            <div className="mt-3">
                                <p className="text-xs font-medium text-[#8f8278]">Friends</p>
                                <ul className="mt-2 grid gap-2">
                                    {invitableFriends.map((f) => {
                                        const chosenFaction = factionChoiceByUser[f.friend.id] ?? defaultFactionId;
                                        return (
                                            <li
                                                key={f.friendship_id}
                                                className="flex items-center gap-3 rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm"
                                            >
                                                <span className="text-[#a8917d]">
                                                    {f.friend.leetcode_username ?? `User #${f.friend.id}`}
                                                </span>
                                                {lobbyInfo?.faction_mode && factions.length > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        {factions.map((faction) => (
                                                            <button
                                                                key={faction.id}
                                                                type="button"
                                                                onClick={() =>
                                                                    setFactionChoiceByUser((prev) => ({
                                                                        ...prev,
                                                                        [f.friend.id]: faction.id,
                                                                    }))
                                                                }
                                                                title={`${faction.name} faction`}
                                                                className={`h-4 w-4 rounded-full transition ${
                                                                    chosenFaction === faction.id
                                                                        ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-[#1b1512]'
                                                                        : 'opacity-50 hover:opacity-100'
                                                                }`}
                                                                style={{ backgroundColor: faction.color }}
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => void handleInvitePlayer(f.friend.id, chosenFaction)}
                                                    disabled={reinvitingUserId === f.friend.id || !hasSlots}
                                                    className="ml-auto rounded-md border border-[#e6a15d]/50 bg-[#e6a15d]/10 px-3 py-1 text-xs font-medium text-[#e8b691] transition hover:bg-[#e6a15d]/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {reinvitingUserId === f.friend.id ? 'Adding...' : 'Add'}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                        {leftPlayers.length === 0 && invitableFriends.length === 0 && (
                            <p className="mt-3 text-sm text-[#8f8278]">No one to add right now.</p>
                        )}
                    </section>
                )}

                {gameStatus === 'finished' && (
                    <section className="mt-6 rounded-lg border border-[#e6a15d]/40 bg-[#e6a15d]/10 px-4 py-4 text-center shadow-xl shadow-black/20">
                        <p className="text-xl font-semibold text-[#e6a15d]">
                            {winner?.label
                                ? winner.winner_user_id === currentUserId
                                    ? '🏆 You win!'
                                    : `🏆 ${winner.label} wins!`
                                : "It's a draw"}
                        </p>
                        <p className="mt-1 text-sm text-[#a8917d]">Game over — the map is frozen.</p>
                    </section>
                )}

                <section className="mt-3 rounded-lg border border-[#3f332d] bg-[#211a16] p-3 shadow-xl shadow-black/20 sm:mt-6 sm:p-4">
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                        {scoreRows.map((row) => {
                            return (
                                <div key={row.key} className="flex items-center gap-2 text-sm">
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} />
                                    <span className="font-semibold text-white">
                                        {row.label}
                                    </span>
                                    <span className="text-xs tabular-nums" style={{ color: row.color }}>
                                        {row.count}/{totalCount}
                                    </span>
                                    <span
                                        className="text-xs font-semibold tabular-nums text-[#e6a15d]"
                                        title={row.breakdown}
                                    >
                                        <AnimatedNumber value={row.points} /> pts
                                    </span>
                                    {row.regionControlPoints > 0 && (
                                        <span className="rounded-full bg-[#e6a15d]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#e8b691]" title={`Holding whole regions: +${row.regionControlPoints}`}>
                                            👑
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                        <div className="flex items-center gap-2 text-sm text-[#555]">
                            <span className="h-3 w-3 rounded-full bg-[#555]" />
                            <span>Free</span>
                            <span className="text-xs tabular-nums">{neutralCount}</span>
                        </div>
                    </div>
                    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#333]">
                        {scoreRows.map((row) => {
                            if (row.count === 0) return null;
                            return (
                                <div
                                    key={row.key}
                                    className="h-full transition-all duration-500"
                                    style={{ width: `${(row.count / totalCount) * 100}%`, backgroundColor: row.color }}
                                />
                            );
                        })}
                        {neutralCount > 0 && (
                            <div
                                className="h-full transition-all duration-500"
                                style={{ width: `${(neutralCount / totalCount) * 100}%`, backgroundColor: '#555' }}
                            />
                        )}
                    </div>

                    {winTarget ? (() => {
                        const leaderPoints = Math.max(0, ...scoreRows.map((row) => row.points));
                        const leader = scoreRows.find((row) => row.points === leaderPoints);
                        const myRow = scoreRows.find((row) => row.key === currentUserId);
                        const myPoints = myRow?.points ?? 0;
                        const progress = Math.min(100, (leaderPoints / winTarget) * 100);
                        return (
                            <div className="mt-3 border-t border-[#24201c] pt-2.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-[#e8b691]">
                                        🏆 Win at {winTarget} pts
                                    </span>
                                    {leader && (
                                        <span className="text-[#8f8278]">
                                            {leader.label}: <span className="tabular-nums text-[#e6a15d]">{leaderPoints}</span>
                                        </span>
                                    )}
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#333]">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-[#e6a15d]/60 to-[#e6a15d] transition-all duration-500"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                                <p className="mt-1 text-[11px] text-[#8f8278]">
                                    {myRow
                                        ? myPoints >= winTarget
                                            ? "You reached the target!"
                                            : `You need ${winTarget - myPoints} more pts`
                                        : "Join a team to see your progress"}
                                </p>
                            </div>
                        );
                    })() : null}
                </section>

                <div className="mt-3 flex flex-col gap-3 lg:mt-6 lg:flex-row lg:items-stretch lg:gap-6">
                    <section className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-[#3f332d] bg-[#211a16] p-2.5 shadow-xl shadow-black/20 transition hover:border-[#c86f3c]/30 hover:shadow-[0_0_35px_-8px_rgba(200,111,60,0.24)] sm:p-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-20 text-[#8f8278]">Loading map...</div>
                        ) : (
                            <div className="flex items-start justify-center gap-3">
                                <MapLegend
                                    regions={legendRegions}
                                    onHover={setHoveredProvinces}
                                    className="hidden w-40 shrink-0 list-none space-y-2 md:flex md:flex-col"
                                />
                                <div className="relative min-w-0 flex-1">
                                    <GeneratedMapRenderer
                                        draft={mapSelection.draft}
                                        captured={displayCaptured}
                                        onSelect={handleSelect}
                                        highlightedProvinces={hoveredProvinces}
                                        bursts={bursts}
                                        fortified={fortifiedIds}
                                        maxZoom={window.innerWidth < 768 ? 6 : 3}
                                    />

                                    {armedPowerup && (
                                        <div className="pointer-events-none absolute left-1/2 top-3 z-30 w-max max-w-[calc(100%_-_1rem)] -translate-x-1/2 rounded-full border border-[#e6a15d]/50 bg-[#1b1512]/95 px-3 py-1.5 text-center text-xs font-medium text-[#e8b691]">
                                            Select a province to use{" "}
                                            {armedPowerup === 'reroll'
                                                ? 'Reroll'
                                                : armedPowerup === 'fortify'
                                                  ? 'Fortify'
                                                  : 'Siege'}{" "}
                                            — click the circle again to cancel
                                        </div>
                                    )}

                                    <PowerUpInventory
                                        powerups={myPowerups}
                                        armed={armedPowerup}
                                        onArm={(kind) => {
                                            setArmedPowerup((current) => (kind && current === kind ? null : kind));
                                            handleClose();
                                        }}
                                    />

                                    {debugEnabled && (
                                        <DebugPanel
                                            lobbyId={lobbyId}
                                            players={players}
                                            currentUserId={currentUserId}
                                            selectedProvinceId={selectedProvince}
                                            selectedProvinceName={
                                                selectedProvinceData?.province_name ??
                                                selectedGeneratedProvince?.name ??
                                                null
                                            }
                                            finished={gameStatus === 'finished'}
                                            onChanged={() => {
                                                void loadMap();
                                                setSyncTick((tick) => tick + 1);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                        {provincesData.length > 0 && (
                            <MapLegend
                                regions={legendRegions}
                                onHover={setHoveredProvinces}
                                className="mt-3 flex list-none gap-2 overflow-x-auto pb-1 pr-1 md:hidden [&>li]:min-w-[9.5rem] [&>li]:shrink-0 [&>li]:px-2.5 [&>li]:py-2 [&>li]:text-xs"
                            />
                        )}

                        {factions.length > 0 && (
                            <div className="mt-4 border-t border-[#24201c] pt-2.5">
                                <p className="text-xs font-medium text-[#8f8278]">
                                    Teams · {players.length} players
                                </p>
                                <div className="mt-2 flex flex-wrap items-start gap-2">
                                    {factions.map((faction) => {
                                        const members = players.filter((p) => p.faction_id === faction.id);
                                        return (
                                            <div
                                                key={faction.id}
                                                className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1"
                                                style={{
                                                    borderColor: faction.color + '44',
                                                    backgroundColor: faction.color + '0d',
                                                }}
                                            >
                                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: faction.color }} />
                                                <span className="shrink-0 text-xs font-semibold" style={{ color: faction.color }}>
                                                    {faction.name}
                                                </span>
                                                <span className="truncate text-xs text-[#d9c5ad]">
                                                    {members.length === 0
                                                        ? '—'
                                                        : members
                                                              .map((member) =>
                                                                  member.leetcode_username ?? `#${member.user_id}`,
                                                              )
                                                              .join(', ')}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </section>

                    {!loading && (
                        <EventLogPanel
                            events={events}
                            currentUserId={currentUserId}
                            className="hidden w-80 shrink-0 max-h-[40rem] lg:flex"
                        />
                    )}
                </div>

                {!loading && (
                    <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
                        {showMobileLog ? (
                            <div className="relative overflow-hidden rounded-t-xl border border-[#3f332d] bg-[#1b1512] shadow-2xl shadow-black/60">
                                <button
                                    type="button"
                                    onClick={() => setShowMobileLog(false)}
                                    aria-label="Close battle log"
                                    className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md border border-white/10 bg-[#24201c] text-[#a8917d]"
                                >
                                    <X size={16} />
                                </button>
                                <EventLogPanel
                                    events={events}
                                    currentUserId={currentUserId}
                                    className="max-h-[45dvh] rounded-none border-0 bg-transparent"
                                />
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowMobileLog(true)}
                                className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#3f332d] bg-[#211a16]/95 text-sm font-semibold text-[#d9c5ad] shadow-2xl shadow-black/50 backdrop-blur"
                            >
                                <ScrollText size={16} className="text-[#e6a15d]" />
                                Battle log
                                <span className="rounded-full bg-[#e6a15d]/15 px-2 py-0.5 text-xs text-[#e6a15d]">
                                    {events.length}
                                </span>
                            </button>
                        )}
                    </div>
                )}

                <ProvincePopup
                    provinceId={selectedProvince}
                    provinceName={selectedProvinceData?.province_name ?? selectedGeneratedProvince?.name ?? null}
                    pos={popPos}
                    owner={owner}
                    capturedByUsername={selectedProvinceData?.captured_by_username ?? undefined}
                    problem={selectedProvinceData?.problem ?? null}
                    submissionUrl={selectedProvinceData?.captured_submission_url ?? null}
                    capturerLeetcodeUsername={selectedProvinceData?.capturer_leetcode_username ?? null}
                    firstCaptureOwner={firstCaptureOwner}
                    capturedRuntimeMs={selectedProvinceData?.captured_runtime_ms}
                    fortified={selectedFortified}
                    fortifiedUntil={selectedProvinceData?.fortified_until ?? null}
                    onClose={handleClose}
                />

                {gameStatus === 'finished' && winner ? (
                    <WinnerOverlay
                        winnerLabel={winner.label}
                        youWon={Boolean(youWon)}
                        accentColor={winnerAccent}
                        onReplay={onReplay}
                        draft={mapSelection.draft}
                        provinces={displayedProvincesData.map((p) => ({ province_id: p.province_id }))}
                        stats={{
                            provinces: winnerScoreRow?.count ?? 0,
                            points: winnerScoreRow?.points ?? 0,
                        }}
                        lobbyId={lobbyId}
                        capturedColors={Object.fromEntries(displayCaptured)}
                    />
                ) : null}

                {showHelp && <HowToPlayModal onClose={() => setShowHelp(false)} />}

                {confirmLeave && (
                    <ConfirmDialog
                        title="Leave this lobby?"
                        message="Your progress in this game will be lost. You can rejoin later if the lobby is still open."
                        confirmLabel="Leave Lobby"
                        danger
                        busy={isLeaving}
                        onConfirm={() => {
                            setConfirmLeave(false);
                            void handleLeave();
                        }}
                        onCancel={() => setConfirmLeave(false)}
                    />
                )}

                <Footer />
            </div>
        </main>
    );
}
