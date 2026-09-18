import { Flame } from "lucide-react";

export function FriendFlame({
    count,
    state,
    ignite = false,
    size = "md",
}: {
    count: number;
    state: "lit" | "pending" | "broken";
    ignite?: boolean;
    size?: "xs" | "sm" | "md" | "lg";
}) {
    const isLit = state === "lit";
    const outerSize = size === "lg" ? "h-36 w-36" : size === "md" ? "h-16 w-16" : size === "sm" ? "h-8 w-8" : "h-12 w-12";
    const glowSize = size === "lg" ? "h-28 w-28" : size === "md" ? "h-12 w-12" : size === "sm" ? "h-6 w-6" : "h-9 w-9";
    const iconSize = size === "lg" ? 88 : size === "md" ? 44 : size === "sm" ? 18 : 28;

    return (
        <div
            className={`relative grid ${outerSize} shrink-0 place-items-center overflow-hidden rounded-full border transition ${
                isLit
                    ? "border-[#c86f3c]/50 bg-[#c86f3c]/15 shadow-lg shadow-[#c86f3c]/10"
                    : "border-[#3a3a3a] bg-[#303030]"
            }`}
        >
            {isLit ? (
                <div className={`flame-glow absolute ${glowSize} rounded-full bg-[#c86f3c]/25 blur-md`} />
            ) : null}

            <Flame
                size={iconSize}
                strokeWidth={2.4}
                className={`relative transition ${
                    isLit
                        ? "fill-[#c86f3c] text-[#e8b691]  drop-shadow-[0_0_10px_rgba(200,111,60,0.55)]"
                        : "fill-[#6b6b6b] text-[#8a8a8a]"
                } ${ignite ? "flame-ignite" : ""}`}
            />

            <span
                className={`absolute font-bold tabular-nums ${
                    size === "lg" ? "text-xl" : "text-sm"
                } ${
                    isLit ? "text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]" : "text-[#d6d6d6]"
                }`}
            >
                {count}
            </span>
        </div>
    );
}
