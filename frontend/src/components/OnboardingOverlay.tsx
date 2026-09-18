import { useState } from "react";
import { Flame, Link2, Map, Trophy } from "lucide-react";

const ONBOARDED_KEY = "mapcode.onboarded";

export function isOnboarded(): boolean {
    try {
        return localStorage.getItem(ONBOARDED_KEY) === "1";
    } catch {
        return true;
    }
}

export function markOnboarded() {
    try {
        localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
        /* ignore */
    }
}

const STEPS = [
    {
        icon: Map,
        title: "Solve. Capture. Conquer.",
        body: "Cinnamon Code turns your LeetCode grind into a live map battle. Every solved problem plants your flag on a province.",
    },
    {
        icon: Link2,
        title: "Link your LeetCode account",
        body: "Verify ownership with an Accepted Two Sum submission so we can track your solves and sync your progress.",
    },
    {
        icon: Map,
        title: "Territory capture",
        body: "Click a province to open its problem. Solve it to capture — and beat the current owner's runtime to steal it. First capture of each province pays bonus points.",
    },
    {
        icon: Trophy,
        title: "Win the map",
        body: "Own over half the map to win, or lock down whole regions for control bonuses. Power-ups like Fortify and Siege turn the tide.",
    },
    {
        icon: Flame,
        title: "Keep the streak alive",
        body: "Solve every day to grow your streak — a daily habit that slowly burns the map in your color.",
    },
];

export function OnboardingOverlay({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState(0);
    const current = STEPS[step];
    const Icon = current.icon;
    const isLast = step === STEPS.length - 1;

    const finish = () => {
        markOnboarded();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border border-[#3a3a3a] bg-[#202020] p-6 shadow-2xl">
                <div className="flex items-start justify-between">
                    <span className="grid h-12 w-12 place-items-center rounded-lg border border-[#c86f3c]/40 bg-[#c86f3c]/10 text-[#c86f3c]">
                        <Icon size={24} />
                    </span>
                    <button
                        type="button"
                        onClick={finish}
                        className="text-sm text-[#8a8a8a] transition hover:text-white"
                    >
                        Skip
                    </button>
                </div>

                <h2 className="mt-4 text-lg font-semibold text-[#eff1f6]">{current.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#b3b3b3]">{current.body}</p>

                <div className="mt-6 flex items-center justify-between">
                    <div className="flex gap-1.5">
                        {STEPS.map((_, index) => (
                            <span
                                key={index}
                                className={`h-1.5 rounded-full transition-all ${
                                    index === step ? "w-6 bg-[#c86f3c]" : "w-1.5 bg-[#3a3a3a]"
                                }`}
                            />
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={isLast ? finish : () => setStep((value) => value + 1)}
                        className="rounded-md bg-[#c86f3c] px-4 py-2 text-sm font-semibold text-[#111] transition hover:bg-[#d9823f]"
                    >
                        {isLast ? "Let's go" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
}
