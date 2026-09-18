import type { WinVariantProps } from "./types";

export function WinV2({ winnerLabel, youWon, accentColor = "#c86f3c", onReplay, background }: WinVariantProps) {
    const title = youWon ? "VICTORY" : "DEFEATED";
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0c]">
            {background}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: `radial-gradient(85% 65% at 50% 105%, ${accentColor}66, transparent 62%)` }}
            />
            <div
                aria-hidden
                className="light-sweep pointer-events-none absolute inset-0"
                style={{ background: `linear-gradient(105deg, transparent 32%, ${accentColor}38 50%, transparent 68%)` }}
            />

            <div className="cinematic-title relative flex flex-col items-center px-6 text-center">
                <div aria-hidden className="pointer-events-none absolute -inset-10" style={{ background: "radial-gradient(70% 70% at 50% 50%, rgba(0,0,0,0.7), transparent 75%)" }} />
                <h1
                    className="relative text-6xl font-black tracking-tight sm:text-8xl"
                    style={{ color: accentColor, textShadow: `0 0 44px ${accentColor}aa` }}
                >
                    {title}
                </h1>
                {winnerLabel ? (
                    <p className="relative mt-5 text-lg font-medium text-[#d0d0d0] sm:text-xl">{winnerLabel}</p>
                ) : null}
                {onReplay ? (
                    <button
                        type="button"
                        onClick={onReplay}
                        className="relative z-10 mt-12 rounded-md px-8 py-3 text-sm font-bold uppercase tracking-widest text-[#111] transition hover:brightness-110"
                        style={{ backgroundColor: accentColor }}
                    >
                        Back to lobby
                    </button>
                ) : null}
            </div>
        </div>
    );
}
