import { Flame, Grid2x2, Map as MapIcon, Play, Trophy, Users, Zap } from "lucide-react";
import { useGoogleLogin } from "./auth/useGoogleLogin";
import { GoogleButton } from "./auth/GoogleButton";

type AuthPageProps = {
    initialError?: string | null;
    onClearError?: () => void;
};

const STEPS = [
    {
        icon: MapIcon,
        title: "Solve a problem",
        body: "Open any province on the map and solve its LeetCode problem. Accepted submissions plant your flag.",
    },
    {
        icon: Trophy,
        title: "Capture the map",
        body: "Own provinces and beat runtimes to steal them. Lock whole regions for control bonuses.",
    },
    {
        icon: Flame,
        title: "Keep the streak",
        body: "Solve daily to grow your streak while your color spreads across the board.",
    },
];

const FEATURES = [
    { icon: Users, title: "Factions & friends", body: "Form teams, split the map, and race your friends to victory." },
    { icon: Zap, title: "Power-ups", body: "Reroll, Fortify and Siege turn the tide when you need an edge." },
    { icon: Grid2x2, title: "Bingo mode", body: "A fresh take: claim cells and complete lines to win." },
    { icon: Play, title: "Live & replayable", body: "See captures in real time and share any match as a replay." },
];

export function AuthPage({ initialError = null, onClearError }: AuthPageProps) {
    const { errorMessage, isRedirecting, onLogin } = useGoogleLogin(initialError, onClearError);

    return (
        <main
            className="min-h-screen text-[#eff1f6]"
            style={{
                background:
                    "linear-gradient(180deg, #1a1614 0%, #12100d 55%, #0f0d0b 100%)",
            }}
        >
            <header className="sticky top-0 z-40 border-b border-[#2e2a26] bg-[#12100d]/90 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
                    <span className="text-lg font-black tracking-tight text-[#e6a15d]">
                        Vio<span className="text-[#eff1f6]">Code</span>
                    </span>
                    <GoogleButton
                        onLogin={onLogin}
                        isRedirecting={isRedirecting}
                        className="!w-auto !px-4 !py-2"
                    />
                </div>
            </header>

            <section className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-20">
                <div className="max-w-2xl">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#5a4235] bg-[#211a16] px-3 py-1 text-xs font-semibold text-[#e8b691]">
                        Free — play with friends
                    </span>
                    <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
                        Solve LeetCode.
                        <br />
                        <span className="text-[#e6a15d]">Capture the map.</span>
                    </h1>
                    <p className="mt-5 max-w-md text-base leading-relaxed text-[#9d8f80]">
                        Turn your daily grind into a live territory battle. Plant flags, steal provinces,
                        and keep a streak that never lets you quit.
                    </p>
                    <div className="mt-8 max-w-sm">
                        <GoogleButton
                            onLogin={onLogin}
                            isRedirecting={isRedirecting}
                            className="!py-3.5"
                        />
                        {errorMessage ? (
                            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {errorMessage}
                            </p>
                        ) : null}
                    </div>
                    <p className="mt-6 text-xs text-[#6b5f54]">
                        An independent project, not affiliated with LeetCode.
                    </p>
                </div>
            </section>

            <section id="how" className="mx-auto max-w-5xl px-6 py-16">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-[#e6a15d]">
                    How it works
                </p>
                <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-[#f4e7d8] sm:text-4xl">
                    Three steps to own the map
                </h2>
                <div className="mt-10 grid gap-5 md:grid-cols-3">
                    {STEPS.map((step, index) => (
                        <div
                            key={step.title}
                            className="rounded-xl border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/15 transition hover:border-[#e6a15d]/45"
                        >
                            <div className="flex items-center gap-3">
                                <span className="grid h-11 w-11 place-items-center rounded-lg border border-[#7a5136] bg-[#2a1f19] text-[#e6a15d]">
                                    <step.icon size={20} />
                                </span>
                                <span className="text-xs font-bold text-[#7a6b5e]">0{index + 1}</span>
                            </div>
                            <h3 className="mt-4 text-lg font-semibold text-[#f4e7d8]">{step.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-[#a8917d]">{step.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section id="features" className="mx-auto max-w-5xl px-6 py-16">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-[#e6a15d]">
                    Features
                </p>
                <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-[#f4e7d8] sm:text-4xl">
                    Built for the grind
                </h2>
                <div className="mt-10 grid gap-5 sm:grid-cols-2">
                    {FEATURES.map((feature) => (
                        <div
                            key={feature.title}
                            className="flex gap-4 rounded-xl border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/15 transition hover:border-[#e6a15d]/40"
                        >
                            <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#7a5136] bg-[#2a1f19] text-[#e6a15d]">
                                <feature.icon size={20} />
                            </span>
                            <div>
                                <h3 className="font-semibold text-[#f4e7d8]">{feature.title}</h3>
                                <p className="mt-1 text-sm leading-relaxed text-[#a8917d]">{feature.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-3xl px-6 py-20 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-[#f4e7d8] sm:text-4xl">
                    Ready to claim your first province?
                </h2>
                <p className="mt-3 text-sm text-[#a8917d]">
                    Sign in with Google and link your LeetCode account to start.
                </p>
                <div className="mx-auto mt-8 max-w-sm">
                    <GoogleButton
                        onLogin={onLogin}
                        isRedirecting={isRedirecting}
                        className="!py-3.5"
                    />
                    {errorMessage ? (
                        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {errorMessage}
                        </p>
                    ) : null}
                </div>
            </section>
        </main>
    );
}