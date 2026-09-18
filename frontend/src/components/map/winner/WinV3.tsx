import { Crown } from "lucide-react";
import type { WinVariantProps } from "./types";

export function WinV3({ winnerLabel, youWon, accentColor = "#c86f3c", onReplay, stats, background }: WinVariantProps) {
    const title = youWon ? "VICTORY" : "DEFEAT";
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0c]">
            {background}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background: `radial-gradient(60% 45% at 50% 38%, ${accentColor}1f, transparent 70%)`,
                }}
            />

            <div className="cinematic-title relative w-full max-w-md rounded-2xl border border-white/10 bg-[#121317]/90 p-8 text-center shadow-2xl backdrop-blur-md">
                <div
                    className="mx-auto grid h-20 w-20 place-items-center rounded-full border"
                    style={{
                        borderColor: `${accentColor}66`,
                        background: `${accentColor}14`,
                        boxShadow: `0 0 50px ${accentColor}55`,
                    }}
                >
                    <Crown size={38} style={{ color: accentColor }} />
                </div>

                <h1 className="mt-5 text-4xl font-black tracking-[0.2em] text-white">{title}</h1>
                {winnerLabel ? (
                    <p className="mt-2 text-base font-medium" style={{ color: accentColor }}>
                        {winnerLabel}
                    </p>
                ) : null}

                {stats ? (
                    <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-6">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-[#8a8a8a]">Provinces</p>
                            <p className="mt-1 text-2xl font-bold tabular-nums text-white">{stats.provinces}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-widest text-[#8a8a8a]">Points</p>
                            <p className="mt-1 text-2xl font-bold tabular-nums text-[#c86f3c]">{stats.points}</p>
                        </div>
                    </div>
                ) : null}

                {onReplay ? (
                    <button
                        type="button"
                        onClick={onReplay}
                        className="mt-7 w-full rounded-md bg-[#c86f3c] px-5 py-3 text-sm font-bold uppercase tracking-widest text-[#111] transition hover:bg-[#d9823f]"
                    >
                        Back to lobby
                    </button>
                ) : null}
            </div>
        </div>
    );
}
