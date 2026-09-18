import { useEffect, useMemo, useState } from "react";
import type { GeneratedMapDraft } from "../features/lobby-map/types";
import { WinV4 } from "./map/winner/WinV4";
import { WinnerMapBackdrop } from "./map/winner/WinnerMapBackdrop";
import { EpicParticles, SideBeams } from "./map/winner/EpicEffects";

/** Length of the pre-result conquest cutscene. */
export const WINNER_CUTSCENE_MS = 6_000;

type WinnerOverlayProps = {
    winnerLabel: string | null;
    youWon: boolean;
    accentColor?: string;
    onReplay?: () => void;
    draft: GeneratedMapDraft;
    provinces?: { province_id: string }[];
    stats?: { provinces: number; points: number } | null;
    lobbyId?: number;
    capturedColors?: Record<string, string>;
};

export function WinnerOverlay({
    winnerLabel,
    youWon,
    accentColor = "#c86f3c",
    onReplay,
    draft,
    provinces,
    stats,
    lobbyId,
    capturedColors,
}: WinnerOverlayProps) {
    const [phase, setPhase] = useState<"conquest" | "result">("conquest");
    const hasMap = Boolean(draft && provinces && provinces.length > 0);

    useEffect(() => {
        if (!hasMap) {
            setPhase("result");
            return;
        }
        const timer = window.setTimeout(() => setPhase("result"), WINNER_CUTSCENE_MS);
        return () => window.clearTimeout(timer);
    }, [hasMap]);

    const backdrop = useMemo(
        () =>
            hasMap ? (
                <WinnerMapBackdrop
                    draft={draft}
                    provinces={provinces ?? []}
                    color={accentColor}
                    capturedColors={capturedColors}
                    prefilled={phase === "result"}
                    opacity={phase === "conquest" ? 0.85 : 0.6}
                    durationMs={WINNER_CUTSCENE_MS}
                />
            ) : null,
        [hasMap, draft, provinces, accentColor, phase],
    );

    if (phase === "conquest" && hasMap) {
        return (
            <div className="fixed inset-0 z-50 overflow-hidden bg-[#070709]">
                {backdrop}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ background: "radial-gradient(80% 80% at 50% 45%, transparent 40%, rgba(0,0,0,0.6) 100%)" }}
                />
                <EpicParticles color={accentColor} />
                <SideBeams color={accentColor} />
                <div
                    aria-hidden
                    className="light-sweep pointer-events-none absolute inset-0"
                    style={{ background: `linear-gradient(105deg, transparent 34%, ${accentColor}30 50%, transparent 66%)` }}
                />
                <div className="absolute inset-x-0 bottom-[16%] px-6 text-center">
                    <p className="cinematic-title text-2xl font-light uppercase tracking-[0.35em] text-white sm:text-3xl">
                        {winnerLabel ?? (youWon ? "You" : "The winner")}
                    </p>
                    <p className="cinematic-title mt-3 text-xs uppercase tracking-[0.45em] text-[#a5a5a5]">
                        claims the map
                    </p>
                </div>
            </div>
        );
    }

    return (
        <WinV4
            winnerLabel={winnerLabel}
            youWon={youWon}
            accentColor={accentColor}
            onReplay={onReplay}
            stats={stats}
            lobbyId={lobbyId}
            capturedColors={capturedColors}
            draft={draft}
            background={backdrop}
        />
    );
}
