import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Copy, Gamepad2, LogOut, Map as MapIcon, Plus, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { apiRequest } from '../api/client';
import { Footer } from '../components/Footer';
import { lobbyCacheKey, readCache, writeCache } from '../api/localCache';
import { MapChooserModal } from '../features/lobby-map/MapChooserModal';
import { MAP_SIZE_CONFIG } from '../features/lobby-map/assets';
import { readLobbyMapSelection, writeLobbyMapSelection } from '../features/lobby-map/storage';
import { normalizeLobbyMapSelection, saveLobbyMapSelection } from '../features/lobby-map/api';
import { mapColors } from '../features/lobby-map/mapColors';
import type { LobbyMapSelection, LobbyMapTopic } from '../features/lobby-map/types';
import { TOPICS } from '../mapRegions';
import { ConfirmDialog } from '../components/ConfirmDialog';

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

type LobbyData = {
    id: number;
    creator_id: number;
    name: string;
    status: string;
    game_mode: string;
    map_size: string;
    max_players: number;
    faction_mode: boolean;
    faction_count: number;
    factions: Faction[];
    map_selection?: LobbyMapSelection | null;
    programming_language: string;
    win_condition: Record<string, unknown>;
    players: LobbyPlayer[];
    left_players: LobbyPlayer[];
    invite_url: string | null;
};

type Friend = {
    friendship_id: number;
    friend: { id: number; leetcode_username: string | null };
};

type LobbyPageProps = {
    lobbyId: number;
    currentUserId: number;
    currentUserVerified: boolean;
    onBack: () => void;
    onGameStarted: (lobbyId: number, players: LobbyPlayer[], factions: Faction[]) => void;
};

const FACTION_COLORS = mapColors.factions;
const FACTION_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
const FACTION_PALETTE = mapColors.factionPalette;

function defaultFactions(count: number): Faction[] {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: FACTION_NAMES[index] ?? `Faction ${index + 1}`,
        color: FACTION_COLORS[index] ?? mapColors.unknownOwner,
    }));
}

// Bump when LobbyData's shape changes so stale-shaped cache is dropped.
const LOBBY_CACHE_VERSION = 1;

const MODE_LABELS: Record<string, string> = {
    free_for_all: 'Free for All',
    team_battle: 'Team Battle',
    bingo: 'Bingo',
};

const MAP_LABELS: Record<string, string> = {
    small: 'Small (14)',
    medium: 'Medium (28)',
    large: 'Large (42)',
};

const LANGUAGE_LABELS: Record<string, string> = {
    python3: 'Python 3',
    cpp: 'C++',
    java: 'Java',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    csharp: 'C#',
    golang: 'Go',
    rust: 'Rust',
};

export function LobbyPage({ lobbyId, currentUserId, currentUserVerified, onBack, onGameStarted }: LobbyPageProps) {
    // Paint the last-seen lobby instantly on re-entry, then revalidate.
    const cachedLobby = readCache<LobbyData>(lobbyCacheKey(lobbyId), LOBBY_CACHE_VERSION);
    const [lobby, setLobby] = useState<LobbyData | null>(cachedLobby?.data ?? null);
    const [loading, setLoading] = useState(!cachedLobby);
    const [copied, setCopied] = useState(false);
    const [showFriends, setShowFriends] = useState(false);
    const [inviteUrl, setInviteUrl] = useState('');
    const [friends, setFriends] = useState<Friend[]>([]);
    const [isStarting, setIsStarting] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [savingFactionId, setSavingFactionId] = useState<number | null>(null);
    const [draggingPlayerId, setDraggingPlayerId] = useState<number | null>(null);
    const [startError, setStartError] = useState<string | null>(null);
    const [leaveError, setLeaveError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [factionError, setFactionError] = useState<string | null>(null);
    const [isMapChooserOpen, setIsMapChooserOpen] = useState(false);
    const [mapSelection, setMapSelection] = useState<LobbyMapSelection>(() => readLobbyMapSelection(lobbyId));
    const [mapSelectionError, setMapSelectionError] = useState<string | null>(null);
    const [isSavingMapSelection, setIsSavingMapSelection] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [reinvitingUserId, setReinvitingUserId] = useState<number | null>(null);

    const mapTopics: LobbyMapTopic[] = useMemo(
        () =>
            TOPICS.map((region) => ({
                id: region.id,
                name: region.name,
                color: region.color,
            })),
        [],
    );

    const loadLobby = useCallback(async () => {
        try {
            const data = await apiRequest<LobbyData>(`/lobbies/${lobbyId}`);
            setLobby(data);
            writeCache(lobbyCacheKey(lobbyId), LOBBY_CACHE_VERSION, data);
            if (data.invite_url) setInviteUrl(data.invite_url);
            const serverSelection =
                'map_selection' in data
                    ? normalizeLobbyMapSelection(data.map_selection)
                    : readLobbyMapSelection(lobbyId);
            setMapSelection(serverSelection);
            writeLobbyMapSelection(lobbyId, serverSelection);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [lobbyId]);

    const refreshLobby = useCallback(async () => {
        try {
            const data = await apiRequest<LobbyData>(`/lobbies/${lobbyId}`);
            setLobby(data);
            writeCache(lobbyCacheKey(lobbyId), LOBBY_CACHE_VERSION, data);
            if (data.invite_url) setInviteUrl(data.invite_url);
        } catch (e) {
            console.error(e);
        }
    }, [lobbyId]);

    useEffect(() => {
        loadLobby();
        apiRequest<Friend[]>('/friends/').then(setFriends).catch(() => {});
        const stored = sessionStorage.getItem(`lobby_invite_${lobbyId}`);
        if (stored) setInviteUrl(stored);
    }, [loadLobby, lobbyId]);

    useEffect(() => {
        const interval = setInterval(() => void refreshLobby(), 4000);
        return () => clearInterval(interval);
    }, [refreshLobby]);

    const handleCopy = useCallback(() => {
        if (!inviteUrl) return;
        navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [inviteUrl]);

    const handleInviteFriend = useCallback(async (userId: number) => {
        setReinvitingUserId(userId);
        try {
            const data = await apiRequest<LobbyData>(`/lobbies/${lobbyId}/invite-user`, {
                method: 'POST',
                body: JSON.stringify({ user_id: userId }),
            });
            setLobby(data);
        } catch (e) {
            console.error(e);
        } finally {
            setReinvitingUserId(null);
        }
    }, [lobbyId]);

    const handleLeave = useCallback(async () => {
        setIsLeaving(true);
        setLeaveError(null);
        try {
            await apiRequest(`/lobbies/${lobbyId}/leave`, { method: 'DELETE' });
            onBack();
        } catch (e) {
            console.error(e);
            setLeaveError(e instanceof Error ? e.message : 'Failed to leave lobby');
        } finally {
            setIsLeaving(false);
        }
    }, [lobbyId, onBack]);

    const handleDelete = useCallback(async () => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await apiRequest(`/lobbies/${lobbyId}`, { method: 'DELETE' });
            onBack();
        } catch (e) {
            console.error(e);
            setDeleteError(e instanceof Error ? e.message : 'Failed to delete lobby');
        } finally {
            setIsDeleting(false);
        }
    }, [lobbyId, onBack]);

    const handleStart = useCallback(async () => {
        setIsStarting(true);
        setStartError(null);
        try {
            const data = await apiRequest<LobbyData>(`/lobbies/${lobbyId}/start`, { method: 'POST' });
            setLobby(data);
            writeCache(lobbyCacheKey(lobbyId), LOBBY_CACHE_VERSION, data);
            onGameStarted(lobbyId, data.players, data.factions);
        } catch (e) {
            console.error(e);
            setStartError(e instanceof Error ? e.message : 'Failed to start game');
        } finally {
            setIsStarting(false);
        }
    }, [lobbyId, onGameStarted]);

    const patchFactionLocally = useCallback((factionId: number, patch: Partial<Faction>) => {
        setLobby((current) => {
            if (!current) return current;
            const factions = (current.factions.length ? current.factions : defaultFactions(current.faction_count)).map((faction) =>
                faction.id === factionId ? { ...faction, ...patch } : faction,
            );
            return { ...current, factions };
        });
    }, []);

    const handleUpdateFaction = useCallback(async (faction: Faction) => {
        setSavingFactionId(faction.id);
        setFactionError(null);
        try {
            const data = await apiRequest<LobbyData>(`/lobbies/${lobbyId}/factions/${faction.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: faction.name, color: faction.color }),
            });
            setLobby(data);
        } catch (e) {
            setFactionError(e instanceof Error ? e.message : 'Failed to update faction');
            void loadLobby();
        } finally {
            setSavingFactionId(null);
        }
    }, [lobbyId, loadLobby]);

    const handleAssignFaction = useCallback(async (userId: number, factionId: number) => {
        setFactionError(null);
        try {
            const data = await apiRequest<LobbyData>(`/lobbies/${lobbyId}/players/${userId}/faction`, {
                method: 'PATCH',
                body: JSON.stringify({ faction_id: factionId }),
            });
            setLobby(data);
        } catch (e) {
            setFactionError(e instanceof Error ? e.message : 'Failed to assign faction');
        }
    }, [lobbyId]);

    const handleMapSelection = useCallback(async (selection: LobbyMapSelection) => {
        setIsSavingMapSelection(true);
        setMapSelectionError(null);
        try {
            const savedSelection = await saveLobbyMapSelection(lobbyId, selection);
            setMapSelection(savedSelection);
            writeLobbyMapSelection(lobbyId, savedSelection);
            setLobby((current) =>
                current
                    ? {
                          ...current,
                          map_selection: savedSelection,
                          map_size:
                              savedSelection.kind === 'generated'
                                  ? savedSelection.draft.size
                                  : current.map_size,
                      }
                    : current,
            );
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to save map';
            setMapSelectionError(message);
            throw e;
        } finally {
            setIsSavingMapSelection(false);
        }
    }, [lobbyId]);

    if (loading) {
        return (
            <main className="min-h-screen bg-transparent p-4 text-white sm:p-6">
                <div className="mx-auto max-w-2xl pt-20 text-center text-[#8f8278]">Loading lobby...</div>
            </main>
        );
    }

    if (!lobby) {
        return (
            <main className="min-h-screen bg-transparent p-4 text-white sm:p-6">
                <div className="mx-auto max-w-2xl pt-20 text-center text-[#8f8278]">Lobby not found</div>
            </main>
        );
    }

    const isCreator = lobby.creator_id === currentUserId;
    const isActive = lobby.status === 'active';
    const playerCount = lobby.players.length;
    const unverifiedPlayerNames = lobby.players
        .filter((p) => !p.leetcode_username)
        .map((p) => (p.user_id === currentUserId ? 'you' : `player #${p.user_id}`));
    const allPlayersVerified = lobby.players.length > 0 && unverifiedPlayerNames.length === 0;
    const canStart =
        isCreator &&
        !isActive &&
        playerCount >= 1 &&
        !isSavingMapSelection &&
        currentUserVerified &&
        allPlayersVerified;
    const canStartBlockReason = !currentUserVerified
        ? 'Link a verified LeetCode account to start a game.'
        : !allPlayersVerified
          ? `Waiting for verified LeetCode accounts: ${unverifiedPlayerNames.join(', ')}.`
          : null;
    const inLobby = lobby.players.some((p) => p.user_id === currentUserId);
    const availableFriends = friends.filter(
        (f) => !lobby.players.some((p) => p.user_id === f.friend.id),
    );

    const factions = lobby.factions.length ? lobby.factions : defaultFactions(lobby.faction_count);
    const groupedByFaction = new Map<number, LobbyPlayer[]>();
    if (lobby.faction_mode) {
        for (const faction of factions) {
            groupedByFaction.set(faction.id, []);
        }
        for (const p of lobby.players) {
            const fid = p.faction_id ?? 0;
            if (!groupedByFaction.has(fid)) groupedByFaction.set(fid, []);
            groupedByFaction.get(fid)!.push(p);
        }
    }

    const mapLabel =
        mapSelection.kind === 'generated'
            ? `${MAP_SIZE_CONFIG[mapSelection.draft.size].label} custom (${mapSelection.draft.provinceCount})`
            : MAP_LABELS[lobby.map_size] ?? lobby.map_size;

    return (
        <main className="min-h-screen bg-transparent p-4 text-white sm:p-6">
            <div className="mx-auto max-w-2xl">
                <header className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="grid h-10 w-10 place-items-center rounded-md border border-[#3f332d] bg-[#211a16] text-[#a8917d] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d]"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">{lobby.name}</h1>
                        <p className="mt-1 text-sm text-[#8f8278]">
                            {MODE_LABELS[lobby.game_mode] ?? lobby.game_mode}
                            {isActive ? ' — Game in progress' : ' — Waiting for players'}
                        </p>
                    </div>
                </header>

                {inviteUrl && (
                    <section className="mt-6 rounded-lg border border-[#3f332d] bg-[#211a16] p-4">
                        <p className="text-xs font-medium text-[#8f8278] mb-2">Invite Link</p>
                        <div className="flex items-center gap-2">
                            <input
                                value={inviteUrl}
                                readOnly
                                className="min-w-0 flex-1 rounded-md border border-[#3f332d] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
                            />
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="rounded-md border border-[#3f332d] bg-[#333] px-3 py-2 text-sm text-[#d9c5ad] transition hover:bg-[#2b211c]"
                            >
                                {copied ? 'Copied!' : <Copy size={16} />}
                            </button>
                        </div>
                    </section>
                )}

                <section className="mt-6 rounded-lg border border-[#3f332d] bg-[#211a16] p-6">
                    <h2 className="text-sm font-semibold text-[#d9c5ad]">Settings</h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                        <div className="rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm">
                            <span className="text-[#8f8278]">Mode</span>
                            <p className="text-[#f4e7d8]">{MODE_LABELS[lobby.game_mode] ?? lobby.game_mode}</p>
                        </div>
                        <div className="rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm">
                            <span className="text-[#8f8278]">Language</span>
                            <p className="text-[#f4e7d8]">{LANGUAGE_LABELS[lobby.programming_language] ?? lobby.programming_language}</p>
                        </div>
                        <div className="rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm">
                            <span className="text-[#8f8278]">Map</span>
                            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="min-w-0 truncate text-[#f4e7d8]">{mapLabel}</p>
                                {isCreator && !isActive ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsMapChooserOpen(true)}
                                        disabled={isSavingMapSelection}
                                        className="inline-flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#211a16] px-3 text-xs font-semibold text-[#d9c5ad] transition hover:border-[#e6a15d]/60 hover:text-white disabled:cursor-not-allowed disabled:text-[#777] sm:h-7 sm:w-7 sm:px-0"
                                        aria-label="Choose map"
                                    >
                                        <MapIcon size={14} />
                                        <span className="sm:hidden">
                                            {isSavingMapSelection ? 'Saving...' : 'Choose map'}
                                        </span>
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <div className="rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm">
                            <span className="text-[#8f8278]">
                                {lobby.faction_mode ? 'Factions' : 'Players'}
                            </span>
                            <p className="text-[#f4e7d8]">
                                {lobby.faction_mode ? lobby.faction_count : `${playerCount}/${lobby.max_players}`}
                            </p>
                        </div>
                    </div>
                    {mapSelectionError ? (
                        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {mapSelectionError}
                        </p>
                    ) : null}
                </section>

                <section className="mt-6 rounded-lg border border-[#3f332d] bg-[#211a16] p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-[#d9c5ad]">
                            {lobby.faction_mode ? `Players (${playerCount})` : `Players (${playerCount}/${lobby.max_players})`}
                        </h2>
                        {inLobby && !isActive && availableFriends.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowFriends(!showFriends)}
                                className="flex items-center gap-1 text-xs text-[#e6a15d] hover:text-[#d87a38]"
                            >
                                <Plus size={14} />
                                Add Friends
                            </button>
                        )}
                    </div>

                    {showFriends && availableFriends.length > 0 && (
                        <div className="mt-3 mb-3 rounded-md border border-[#3f332d] bg-[#1b1512] divide-y divide-[#3f332d]">
                            {availableFriends.map((f) => (
                                <button
                                    key={f.friendship_id}
                                    type="button"
                                    onClick={() => handleInviteFriend(f.friend.id)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#f4e7d8] hover:bg-[#24201c]"
                                >
                                    <UserPlus size={14} className="text-[#8f8278]" />
                                    {f.friend.leetcode_username ?? `User #${f.friend.id}`}
                                    <span className="ml-auto text-xs text-[#e6a15d]">Invite</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {lobby.faction_mode && groupedByFaction.size > 0 ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {factions.map((faction) => {
                                const members = groupedByFaction.get(faction.id) ?? [];
                                return (
                                    <div
                                        key={faction.id}
                                        onDragOver={(event) => {
                                            if (isCreator && !isActive && draggingPlayerId) event.preventDefault();
                                        }}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            if (!isCreator || isActive || !draggingPlayerId) return;
                                            void handleAssignFaction(draggingPlayerId, faction.id);
                                            setDraggingPlayerId(null);
                                        }}
                                        className={`rounded-md border bg-[#1b1512] p-3 transition ${
                                            draggingPlayerId
                                                ? 'border-[#e6a15d]/60 bg-[#2a2418]'
                                                : 'border-[#3f332d]'
                                        }`}
                                    >
                                        <div className="mb-2 flex items-center gap-2">
                                            {isCreator && !isActive ? (
                                                <>
                                                    <div className="relative shrink-0">
                                                        <span
                                                            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full"
                                                            style={{ backgroundColor: faction.color }}
                                                        />
                                                        <select
                                                            value={faction.color}
                                                            onChange={(event) => {
                                                                const nextColor = event.currentTarget.value;
                                                                patchFactionLocally(faction.id, { color: nextColor });
                                                                void handleUpdateFaction({ ...faction, color: nextColor });
                                                            }}
                                                            aria-label={`${faction.name} color`}
                                                            className="h-8 w-28 rounded-md border border-[#3f332d] bg-[#191410] pl-7 pr-2 text-xs text-[#d9c5ad] outline-none focus:border-[#e6a15d]/70"
                                                        >
                                                            {FACTION_PALETTE.map((option) => (
                                                                <option key={option.color} value={option.color}>
                                                                    {option.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <input
                                                        value={faction.name}
                                                        onChange={(event) => patchFactionLocally(faction.id, { name: event.target.value })}
                                                        onBlur={(event) => handleUpdateFaction({ ...faction, name: event.currentTarget.value })}
                                                        className="min-w-0 flex-1 rounded-md border border-[#3f332d] bg-[#191410] px-2 py-1.5 text-xs font-medium text-white outline-none focus:border-[#e6a15d]/70"
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: faction.color }} />
                                                    <p className="min-w-0 truncate text-xs font-medium" style={{ color: faction.color }}>
                                                        {faction.name}
                                                    </p>
                                                </>
                                            )}
                                            {savingFactionId === faction.id && (
                                                <span className="ml-auto text-[11px] text-[#8f8278]">Saving</span>
                                            )}
                                        </div>
                                        {members.map((player) => (
                                            <div
                                                key={player.user_id}
                                                draggable={isCreator && !isActive}
                                                onDragStart={() => setDraggingPlayerId(player.user_id)}
                                                onDragEnd={() => setDraggingPlayerId(null)}
                                                className={`flex items-center gap-2 rounded px-1 py-1 text-sm transition ${
                                                    isCreator && !isActive
                                                        ? 'cursor-grab hover:bg-[#24201c] active:cursor-grabbing'
                                                        : ''
                                                }`}
                                            >
                                                <UserCheck size={14} style={{ color: faction.color }} />
                                                <span className="text-[#f4e7d8]">
                                                    {player.leetcode_username ?? 'Unverified'}
                                                </span>
                                                {player.user_id === lobby.creator_id && (
                                                    <span className="ml-auto text-xs text-[#e6a15d]">Host</span>
                                                )}
                                            </div>
                                        ))}
                                        {members.length === 0 && (
                                            <p className="rounded border border-dashed border-[#444] px-2 py-2 text-center text-xs text-[#777]">
                                                {isCreator && !isActive ? 'Drop players here' : 'No players'}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <ul className="mt-3 grid gap-2">
                            {lobby.players.map((player) => {
                                const fid = player.faction_id;
                                const color = fid ? FACTION_COLORS[fid - 1] ?? mapColors.unknownOwner : mapColors.unknownOwner;
                                return (
                                    <li
                                        key={player.user_id}
                                        className="flex items-center gap-3 rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm"
                                    >
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                        <UserCheck size={16} className="text-[#e6a15d]" />
                                        <span className="text-[#f4e7d8]">
                                            {player.leetcode_username ?? 'Unverified'}
                                        </span>
                                        {player.user_id === lobby.creator_id && (
                                            <span className="text-xs text-[#e6a15d] ml-auto">Host</span>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {factionError && (
                        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {factionError}
                        </p>
                    )}
                    {(lobby.left_players?.length ?? 0) > 0 && (
                        <div className="mt-4 rounded-md border border-[#3f332d] bg-[#1b1512] p-3">
                            <p className="text-xs font-medium text-[#8f8278]">
                                Recently left ({lobby.left_players.length})
                            </p>
                            <ul className="mt-2 grid gap-2">
                                {lobby.left_players.map((player) => (
                                    <li
                                        key={player.user_id}
                                        className="flex items-center gap-3 rounded-md border border-[#3f332d] bg-[#191410] px-3 py-2 text-sm"
                                    >
                                        <span className="grid h-7 w-7 place-items-center rounded-full border border-[#444] text-xs text-[#8f8278]">
                                            <UserPlus size={13} />
                                        </span>
                                        <span className="text-[#a8917d]">
                                            {player.leetcode_username ?? `User #${player.user_id}`}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void handleInviteFriend(player.user_id)}
                                            disabled={reinvitingUserId === player.user_id || isActive}
                                            className="ml-auto rounded-md border border-[#e6a15d]/50 bg-[#e6a15d]/10 px-3 py-1 text-xs font-medium text-[#e8b691] transition hover:bg-[#e6a15d]/20 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {reinvitingUserId === player.user_id ? 'Inviting...' : 'Re-invite'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>

                <div className="mt-6 flex flex-wrap gap-3">
                    {inLobby && (
                        <button
                            type="button"
                            onClick={() => setConfirmLeave(true)}
                            disabled={isLeaving}
                            className="rounded-md border border-[#3f332d] bg-[#211a16] px-4 py-2.5 text-sm font-medium text-[#d9c5ad] transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:border-[#3f332d] disabled:bg-[#211a16] disabled:text-[#777]"
                        >
                            <LogOut size={16} className="inline-block mr-2" />
                            {isLeaving ? 'Leaving...' : 'Leave Lobby'}
                        </button>
                    )}
                    {isCreator && (
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            disabled={isDeleting}
                            className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:bg-red-500/20 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Trash2 size={16} className="inline-block mr-2" />
                            {isDeleting ? 'Deleting...' : 'Delete Lobby'}
                        </button>
                    )}
                    {canStart && (
                        <button
                            type="button"
                            onClick={handleStart}
                            disabled={isStarting}
                            className="flex-1 rounded-md bg-[#e6a15d] px-4 py-2.5 text-sm font-semibold text-[#111] transition hover:bg-[#d87a38] disabled:cursor-not-allowed disabled:bg-[#3f332d] disabled:text-[#777]"
                        >
                            <Gamepad2 size={16} className="inline-block mr-2" />
                            {isStarting
                                ? 'Starting...'
                                : `Start Game (${playerCount} ${playerCount === 1 ? 'player' : 'players'})`}
                        </button>
                    )}
                    {isCreator && !isActive && canStartBlockReason ? (
                        <p className="mt-3 rounded-md border border-[#3f332d] bg-[#211a16] px-3 py-2 text-xs text-[#a8917d]">
                            {canStartBlockReason}
                        </p>
                    ) : null}
                </div>
                {startError && (
                    <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        {startError}
                    </p>
                )}
                {leaveError && (
                    <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        {leaveError}
                    </p>
                )}
                {deleteError && (
                    <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        {deleteError}
                    </p>
                )}
                <MapChooserModal
                    open={isMapChooserOpen}
                    availableTopics={mapTopics}
                    currentSelection={mapSelection}
                    onClose={() => setIsMapChooserOpen(false)}
                    onSelect={handleMapSelection}
                />

                {confirmLeave && (
                    <ConfirmDialog
                        title="Leave this lobby?"
                        message="You can rejoin later through the invite link. The host will move to another player if you leave."
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
                {confirmDelete && (
                    <ConfirmDialog
                        title="Delete this lobby?"
                        message="This will end the lobby for everyone and cannot be undone."
                        confirmLabel="Delete Lobby"
                        danger
                        busy={isDeleting}
                        onConfirm={() => {
                            setConfirmDelete(false);
                            void handleDelete();
                        }}
                        onCancel={() => setConfirmDelete(false)}
                    />
                )}

                <Footer />
            </div>
        </main>
    );
}
