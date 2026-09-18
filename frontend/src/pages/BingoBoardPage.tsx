import { useState, useCallback, useEffect, useMemo } from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { BingoBoard } from '../components/bingo/BingoBoard';
import { EventLogPanel } from '../components/map/EventLogPanel';
import { Footer } from '../components/Footer';
import { apiRequest } from '../api/client';
import { useLobbyEvents } from '../hooks/useLobbyEvents';
import type { BingoCellData } from '../components/bingo/BingoBoard';

const FACTION_COLORS = ['#00c2ff', '#ff4d6d', '#ffb020', '#27d980'];

type WinnerInfo = {
    winner_user_id: number | null;
    winner_faction_id: number | null;
    label: string | null;
};

type BingoScoreEntry = {
    team_id: number;
    label: string;
    color: string;
    cells: number;
};

type BingoApiResponse = {
    lobby_id: number;
    status: string;
    winner: WinnerInfo | null;
    claimed_count: number;
    board_size: number;
    cells: BingoCellData[];
    score: BingoScoreEntry[];
    winning_line: number[] | null;
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

type BingoBoardPageProps = {
    lobbyId: number;
    currentUserId: number;
    players: LobbyPlayer[];
    factions: Faction[];
    isAdmin?: boolean;
    onBack: () => void;
    onReplay?: () => void;
    onLeft: () => void;
};

const STATE_POLL_INTERVAL_MS = 7_500;
const SYNC_INTERVAL_MS = 60_000;
const SYNC_JITTER_MS = 15_000;

export function BingoBoardPage({ lobbyId, currentUserId, players, factions, onBack, onLeft }: BingoBoardPageProps) {
    const [cells, setCells] = useState<BingoCellData[]>([]);
    const [score, setScore] = useState<BingoScoreEntry[]>([]);
    const [gameStatus, setGameStatus] = useState<string>('active');
    const [winner, setWinner] = useState<WinnerInfo | null>(null);
    const [winningLine, setWinningLine] = useState<number[] | null>(null);
    const [syncTick, setSyncTick] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isLeaving, setIsLeaving] = useState(false);
    const [leaveError, setLeaveError] = useState<string | null>(null);

    const { events } = useLobbyEvents(lobbyId, syncTick);

    const teamColor = useMemo(() => {
        const byTeam = new Map<number, string>();
        for (const entry of score) byTeam.set(entry.team_id, entry.color);
        if (byTeam.size === 0) {
            // Fall back to faction/player colors before the first response.
            for (const faction of factions) byTeam.set(faction.id, faction.color);
            for (const player of players) {
                if (!byTeam.has(player.user_id)) {
                    const fid = player.faction_id ?? 0;
                    byTeam.set(player.user_id, FACTION_COLORS[fid - 1] ?? '#888');
                }
            }
        }
        return byTeam;
    }, [score, factions, players]);

    const applyResponse = useCallback((data: BingoApiResponse) => {
        setCells(data.cells);
        setScore(data.score ?? []);
        setGameStatus(data.status);
        setWinner(data.winner ?? null);
        setWinningLine(data.winning_line ?? null);
    }, []);

    const loadBoard = useCallback(async () => {
        try {
            applyResponse(await apiRequest<BingoApiResponse>(`/lobbies/${lobbyId}/map`));
        } catch (e) {
            console.error(e);
        }
    }, [lobbyId, applyResponse]);

    const sync = useCallback(async () => {
        try {
            applyResponse(await apiRequest<BingoApiResponse>(`/lobbies/${lobbyId}/map/sync`, { method: 'POST' }));
            setSyncTick((tick) => tick + 1);
        } catch (e) {
            console.error(e);
        }
    }, [lobbyId, applyResponse]);

    useEffect(() => {
        setLoading(true);
        loadBoard()
            .then(() => sync())
            .finally(() => setLoading(false));
    }, [loadBoard, sync]);

    useEffect(() => {
        if (gameStatus === 'finished') return;
        const interval = setInterval(loadBoard, STATE_POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [loadBoard, gameStatus]);

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

    const handleLeave = useCallback(async () => {
        const confirmed = window.confirm('Leave this lobby?');
        if (!confirmed) return;

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

    const totalClaimed = cells.filter((cell) => cell.claimed_by).length;

    return (
        <main className="min-h-screen bg-transparent p-4 text-white sm:p-6">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={onBack}
                            className="grid h-10 w-10 place-items-center rounded-md border border-[#3a3a3a] bg-[#262626] text-[#b3b3b3] transition hover:border-[#c86f3c]/60 hover:text-[#c86f3c]"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">Bingo</h1>
                            <p className="mt-1 text-sm text-[#8a8a8a]">
                                Claim cells by solving problems — first full row, column, or diagonal wins
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleLeave}
                        disabled={isLeaving}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#3a3a3a] bg-[#262626] px-4 text-sm font-medium text-[#d7d7d7] transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:text-[#777]"
                    >
                        <LogOut size={16} />
                        {isLeaving ? 'Leaving...' : 'Leave Lobby'}
                    </button>
                </header>
                {leaveError && (
                    <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {leaveError}
                    </p>
                )}

                {gameStatus === 'finished' && (
                    <section className="mt-6 rounded-lg border border-[#c86f3c]/40 bg-[#c86f3c]/10 px-4 py-4 text-center shadow-xl shadow-black/20">
                        <p className="text-xl font-semibold text-[#c86f3c]">
                            {winner?.label
                                ? winner.winner_user_id === currentUserId
                                    ? '🏆 BINGO — You win!'
                                    : `🏆 BINGO — ${winner.label} wins!`
                                : "It's a draw"}
                        </p>
                        <p className="mt-1 text-sm text-[#b3b3b3]">Game over — the board is frozen.</p>
                    </section>
                )}

                <section className="mt-6 rounded-lg border border-[#3a3a3a] bg-[#262626] p-4 shadow-xl shadow-black/20">
                    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                        {score.map((entry) => (
                            <div key={entry.team_id} className="flex items-center gap-2 text-sm">
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="font-semibold text-white">{entry.label}</span>
                                <span className="text-xs tabular-nums" style={{ color: entry.color }}>
                                    {entry.cells} cells
                                </span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2 text-sm text-[#555]">
                            <span className="h-3 w-3 rounded-full bg-[#555]" />
                            <span>Free</span>
                            <span className="text-xs tabular-nums">{cells.length - totalClaimed}</span>
                        </div>
                    </div>
                </section>

                <div className="mt-6 flex items-stretch gap-6">
                    <section className="min-w-0 flex-1 overflow-hidden rounded-lg border border-[#3a3a3a] bg-[#262626] p-4 shadow-xl shadow-black/20">
                        {loading ? (
                            <div className="flex items-center justify-center py-20 text-[#8a8a8a]">Loading board...</div>
                        ) : (
                            <BingoBoard
                                cells={cells}
                                teamColor={teamColor}
                                winningLine={winningLine}
                                currentUserId={currentUserId}
                            />
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
                    <EventLogPanel
                        events={events}
                        currentUserId={currentUserId}
                        className="mt-6 max-h-80 lg:hidden"
                    />
                )}

                <Footer />
            </div>
        </main>
    );
}
