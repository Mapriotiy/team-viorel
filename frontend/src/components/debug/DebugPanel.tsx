import { useState } from "react";
import { Bug } from "lucide-react";
import { apiRequest } from "../../api/client";

type DebugPlayer = {
    user_id: number;
    leetcode_username: string | null;
    faction_id: number | null;
};

type DebugPanelProps = {
    lobbyId: number;
    players: DebugPlayer[];
    currentUserId: number;
    selectedProvinceId: string | null;
    selectedProvinceName: string | null;
    finished?: boolean;
    onChanged: () => void;
};

const POWERUP_TYPES = ["reroll", "fortify", "siege"] as const;

function playerLabel(player: DebugPlayer): string {
    return player.leetcode_username ?? `Player #${player.user_id}`;
}

export function DebugPanel({
    lobbyId,
    players,
    currentUserId,
    selectedProvinceId,
    selectedProvinceName,
    finished = false,
    onChanged,
}: DebugPanelProps) {
    const [open, setOpen] = useState(true);
    const [playerId, setPlayerId] = useState<number>(currentUserId);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const opponent = players.find((player) => player.user_id !== playerId);

    const finish = (winnerUserId: number | null) =>
        void run(`/admin/debug/lobbies/${lobbyId}/finish`, {
            winner_user_id: winnerUserId,
            winner_faction_id: null,
        });

    const run = async (path: string, body?: unknown) => {
        setBusy(true);
        setError(null);
        setSuccess(null);
        try {
            await apiRequest(path, {
                method: "POST",
                body: body ? JSON.stringify(body) : undefined,
            });
            setSuccess("Applied");
            onChanged();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Action failed");
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Open debug tools"
                className="absolute left-3 top-3 z-[60] inline-flex items-center gap-1.5 rounded-md border border-[#00d9ff]/50 bg-[#1a1a1a]/95 px-2.5 py-1.5 text-xs font-semibold text-[#00d9ff] shadow-xl backdrop-blur transition hover:bg-[#00d9ff]/10"
            >
                <Bug size={14} /> DEBUG
            </button>
        );
    }

    return (
        <div className="absolute left-3 top-3 z-[60] w-72 rounded-lg border border-[#00d9ff]/40 bg-[#1a1a1a]/95 p-3 text-xs shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-bold text-[#00d9ff]">
                    <Bug size={13} /> DEBUG
                </span>
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-[#8f8278] transition hover:text-white"
                >
                    &times;
                </button>
            </div>

            <label className="mt-2.5 block">
                <span className="text-[#8f8278]">Act as player</span>
                <select
                    value={playerId}
                    onChange={(e) => setPlayerId(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-[#3f332d] bg-[#1b1512] px-2 py-1.5 text-white outline-none focus:border-[#00d9ff]/70"
                >
                    {players.map((p) => (
                        <option key={p.user_id} value={p.user_id}>
                            {playerLabel(p)}
                        </option>
                    ))}
                </select>
            </label>

            <div className="mt-2 grid grid-cols-3 gap-1">
                {POWERUP_TYPES.map((powerup) => (
                    <button
                        key={powerup}
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            void run(`/admin/debug/lobbies/${lobbyId}/powerups`, {
                                user_id: playerId,
                                [powerup]: 1,
                            })
                        }
                        className="rounded-md border border-[#3f332d] bg-[#1b1512] px-2 py-1.5 font-semibold text-[#e8b691] transition hover:border-[#e6a15d]/60 disabled:opacity-50"
                    >
                        +{powerup}
                    </button>
                ))}
            </div>

            <div className="mt-3 border-t border-[#24201c] pt-2.5">
                <p className="truncate text-[#8f8278]">
                    Province:{" "}
                    <span className="text-[#f4e7d8]">
                        {selectedProvinceName ?? "none selected"}
                    </span>
                </p>
                <div className="mt-1.5 flex gap-1">
                    <button
                        type="button"
                        disabled={!selectedProvinceId || busy}
                        onClick={() =>
                            void run(
                                `/admin/debug/lobbies/${lobbyId}/provinces/${selectedProvinceId}/capture`,
                                { user_id: playerId },
                            )
                        }
                        className="flex-1 rounded-md border border-[#00d9ff]/50 bg-[#00d9ff]/10 px-2 py-1.5 font-semibold text-[#7fe8ff] transition hover:bg-[#00d9ff]/20 disabled:opacity-40"
                    >
                        Capture
                    </button>
                    <button
                        type="button"
                        disabled={!selectedProvinceId || busy}
                        onClick={() =>
                            void run(
                                `/admin/debug/lobbies/${lobbyId}/provinces/${selectedProvinceId}/uncapture`,
                            )
                        }
                        className="flex-1 rounded-md border border-red-400/50 bg-red-500/10 px-2 py-1.5 font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                    >
                        Release
                    </button>
                </div>
            </div>

            <div className="mt-3 border-t border-[#24201c] pt-2.5">
                <p className="text-[#8f8278]">
                    Finish game as{" "}
                    <span className="text-[#f4e7d8]">{playerLabel(players.find((p) => p.user_id === playerId) ?? players[0])}</span>
                </p>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                    <button
                        type="button"
                        disabled={finished || busy}
                        onClick={() => finish(playerId)}
                        className="rounded-md border border-[#2bff88]/50 bg-[#2bff88]/10 px-2 py-1.5 font-semibold text-[#7ef7bb] transition hover:bg-[#2bff88]/20 disabled:opacity-40"
                    >
                        Win
                    </button>
                    <button
                        type="button"
                        disabled={finished || busy}
                        onClick={() => finish(null)}
                        className="rounded-md border border-[#e6a15d]/50 bg-[#e6a15d]/10 px-2 py-1.5 font-semibold text-[#e8b691] transition hover:bg-[#e6a15d]/20 disabled:opacity-40"
                    >
                        Draw
                    </button>
                    <button
                        type="button"
                        disabled={finished || busy || !opponent}
                        onClick={() => opponent && finish(opponent.user_id)}
                        title={opponent ? `Win for ${playerLabel(opponent)}` : "No opponent"}
                        className="rounded-md border border-red-400/50 bg-red-500/10 px-2 py-1.5 font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-40"
                    >
                        Lose
                    </button>
                </div>
            </div>

            {error && <p className="mt-2 text-red-300">{error}</p>}
            {success && <p className="mt-2 text-[#2bff88]">{success}</p>}
        </div>
    );
}
