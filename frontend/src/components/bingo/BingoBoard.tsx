import { useState } from 'react';
import { DIFFICULTY_COLORS } from '../../mapRegions';

export type BingoCellData = {
    cell_index: number;
    row: number;
    col: number;
    problem: { title: string; title_slug: string; difficulty: string; url: string } | null;
    claimed_by: number | null;
    claimed_team_id: number | null;
    claimed_at: string | null;
    claimed_submission_url: string | null;
    claimer_leetcode_username: string | null;
};

type BingoBoardProps = {
    cells: BingoCellData[];
    teamColor: Map<number, string>;
    winningLine: number[] | null;
    currentUserId: number;
};

export function BingoBoard({ cells, teamColor, winningLine, currentUserId }: BingoBoardProps) {
    const [openCell, setOpenCell] = useState<number | null>(null);

    const winningSet = new Set(winningLine ?? []);
    const selected = openCell != null ? cells.find((c) => c.cell_index === openCell) ?? null : null;

    return (
        <div>
            <div className="mx-auto grid max-w-2xl grid-cols-5 gap-2">
                {cells.map((cell) => {
                    const claimColor = cell.claimed_team_id != null
                        ? teamColor.get(cell.claimed_team_id) ?? '#888'
                        : null;
                    const isWinning = winningSet.has(cell.cell_index);
                    const isMine = cell.claimed_by === currentUserId;

                    return (
                        <button
                            key={cell.cell_index}
                            type="button"
                            onClick={() => setOpenCell(cell.cell_index)}
                            className={`relative flex aspect-square flex-col items-center justify-center gap-1 rounded-md border p-1.5 text-center transition hover:border-white/40 ${
                                isWinning ? 'ring-2 ring-[#c86f3c] shadow-lg shadow-[#c86f3c]/20' : ''
                            }`}
                            style={{
                                borderColor: claimColor ? claimColor + '99' : '#3a3a3a',
                                backgroundColor: claimColor ? claimColor + (isWinning ? '33' : '1f') : '#1f1f1f',
                            }}
                        >
                            <span className="line-clamp-3 w-full break-words text-[0.7rem] leading-tight text-[#eff1f6]">
                                {cell.problem?.title ?? '?'}
                            </span>
                            <span
                                className="text-[0.625rem] font-semibold"
                                style={{ color: DIFFICULTY_COLORS[cell.problem?.difficulty ?? ''] ?? '#888' }}
                            >
                                {cell.problem?.difficulty ?? ''}
                            </span>
                            {cell.claimed_by && (
                                <span
                                    className="max-w-full truncate rounded-full px-1.5 text-[0.5625rem] font-semibold"
                                    style={{ backgroundColor: (claimColor ?? '#888') + '33', color: claimColor ?? '#aaa' }}
                                >
                                    {isMine ? 'you' : cell.claimer_leetcode_username ?? 'claimed'}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpenCell(null)}>
                    <div
                        className="w-full max-w-sm rounded-lg border border-[#3a3a3a] bg-[#262626] p-5 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white">
                                Cell {selected.row + 1}×{selected.col + 1}
                            </h3>
                            <button onClick={() => setOpenCell(null)} className="text-gray-500 hover:text-white text-lg leading-none">
                                &times;
                            </button>
                        </div>

                        {selected.problem && (
                            <a
                                href={selected.problem.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 block rounded-md border border-[#3a3a3a] bg-[#1f1f1f] px-3 py-2 text-sm text-[#eff1f6] transition hover:border-white/30"
                            >
                                <span className="block truncate font-medium">{selected.problem.title}</span>
                                <span
                                    className="mt-1 block text-xs font-medium"
                                    style={{ color: DIFFICULTY_COLORS[selected.problem.difficulty] ?? '#aaa' }}
                                >
                                    {selected.problem.difficulty}
                                </span>
                            </a>
                        )}

                        <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="text-gray-400">Status</span>
                            <span className="text-[#eff1f6]">
                                {selected.claimed_by
                                    ? selected.claimed_by === currentUserId
                                        ? 'Claimed by you'
                                        : `Claimed by ${selected.claimer_leetcode_username ?? 'someone'}`
                                    : 'Free — solve it to claim'}
                            </span>
                        </div>

                        {selected.claimed_submission_url && (
                            <a
                                href={selected.claimed_submission_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-3 block rounded-md border border-[#3a3a3a] bg-[#1f1f1f] px-3 py-2 text-center text-xs font-medium text-[#d7d7d7] transition hover:border-white/30 hover:text-white"
                            >
                                View solution
                            </a>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
