import type { WinVariantProps } from "./types";

export function WinV1({ winnerLabel, youWon, accentColor = "#c86f3c", onReplay, background }: WinVariantProps) {
    const title = youWon ? "VICTORY" : "DEFEAT";
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0a0a0c]">
            {background}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: `radial-gradient(52% 42% at 50% 45%, ${accentColor}22, transparent 72%)` }}
            />
            <div aria-hidden className="absolute inset-x-0 top-0 h-[7vh] bg-[#0a0a0c]" />
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-[7vh] bg-[#0a0a0c]" />

            <div className="cinematic-title relative flex flex-col items-center px-6 text-center">
                <div aria-hidden className="pointer-events-none absolute -inset-10" style={{ background: "radial-gradient(70% 70% at 50% 50%, rgba(0,0,0,0.75), transparent 75%)" }} />
                <h1 className="relative text-5xl font-black tracking-[0.32em] text-white sm:text-7xl">
                    {title}
                </h1>
                <div className="relative mt-6 h-px w-28" style={{ background: accentColor }} />
                {winnerLabel ? (
                    <p className="relative mt-6 text-lg font-medium text-[#c9c9c9] sm:text-xl">{winnerLabel}</p>
                ) : null}
                {onReplay ? (
                    <button
                        type="button"
                        onClick={onReplay}
                        className="relative z-10 mt-12 border border-white/20 px-8 py-3 text-sm uppercase tracking-[0.25em] text-white transition hover:border-white/60 hover:bg-white/5"
                    >
                        Back to lobby
                    </button>
                ) : null}
            </div>
        </div>
    );
}
