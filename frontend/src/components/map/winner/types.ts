import type { ReactNode } from "react";
import type { GeneratedMapDraft } from "../../../features/lobby-map/types";

export type WinVariantProps = {
    winnerLabel: string | null;
    youWon: boolean;
    accentColor?: string;
    onReplay?: () => void;
    stats?: { provinces: number; points: number } | null;
    lobbyId?: number;
    capturedColors?: Record<string, string>;
    draft: GeneratedMapDraft;
    /** Optional map backdrop rendered behind the overlay. */
    background?: ReactNode;
};
