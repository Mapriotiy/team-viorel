import type { WinVariantProps } from "./types";

export function WinV5({ winnerLabel, youWon, accentColor = "#c86f3c", onReplay, background }: WinVariantProps) {
    const title = youWon ? "VICTORY" : "DEFEAT";
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0c]">
            {background}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ background: `linear-gradient(180deg, transparent, ${accentColor}14 50%, transparent)` }} />

            <div className="cinematic-title relative flex flex-col items-center px-6 text-center">
                <div aria-hidden className="pointer-events-none absolute -inset-12" style={{ background: "radial-gradient(70% 70% at 50% 50%, rgba(0,0,0,0.7), transparent 78%)" }} />
                <h1 className="relative text-6xl font-thin uppercase tracking-[0.5em] text-white sm:text-8xl">
                    {title}
                </h1>
                <div className="relative mt-8 h-px w-40 bg-white/25" />
                {winnerLabel ? (
                    <p className="relative mt-8 text-xl font-light tracking-[0.3em] uppercase text-[#bdbdbd]">
                        {winnerLabel}
                    </p>
                ) : null}
                {onReplay ? (
                    <button
                        type="button"
                        onClick={onReplay}
                        className="relative z-10 mt-14 text-xs uppercase tracking-[0.4em] text-[#8a8a8a] transition hover:text-white"
                    >
                        Back to lobby
                    </button>
                ) : null}
            </div>
        </div>
    );
}
