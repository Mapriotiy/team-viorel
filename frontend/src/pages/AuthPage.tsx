import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Flame, Grid2x2, Map as MapIcon, Play, Trophy, Users, Zap } from "lucide-react";
import { useGoogleLogin } from "./auth/useGoogleLogin";
import { GoogleButton } from "./auth/GoogleButton";
import { Footer } from "../components/Footer";
import { Logo } from "../components/Logo";
import { GeneratedMapRenderer } from "../features/lobby-map/GeneratedMapRenderer";
import { DEFAULT_MAP_DRAFT } from "../features/lobby-map/defaultDraft";
import { mapColors } from "../features/lobby-map/mapColors";

type AuthPageProps = {
    initialError?: string | null;
    onClearError?: () => void;
};

const FACTION_COLORS = mapColors.landing.players;
const ENEMY_COLOR = mapColors.landing.enemy;
const FEATURE_ACCENTS = mapColors.landing.accents;

const googleButtonClassName =
    "!border-[#5a4235] !bg-[#211a16]/85 !text-[#f4e7d8] hover:!border-[#e6a15d]/60 hover:!bg-[#2a1f19]";

function HeroMap() {
    const [captured, setCaptured] = useState<Map<string, string>>(new Map());
    const provinces = useMemo(() => DEFAULT_MAP_DRAFT.provinces.map((p) => p.provinceId), []);

    useEffect(() => {
        let index = 0;
        const interval = window.setInterval(() => {
            const id = provinces[index % provinces.length];
            const isEnemy = Math.floor(index / 2) % 4 === 3;
            const color = isEnemy
                ? ENEMY_COLOR
                : FACTION_COLORS[Math.floor(index / 2) % FACTION_COLORS.length];
            setCaptured((prev) => {
                const next = new Map(prev);
                next.set(id, color);
                return next;
            });
            index += 1;
        }, 280);
        return () => window.clearInterval(interval);
    }, [provinces]);

    return (
        <div className="pointer-events-none select-none">
            <GeneratedMapRenderer
                draft={DEFAULT_MAP_DRAFT}
                captured={captured}
                zoomable={false}
                interactive={false}
                showMarkers={false}
                showRoads={false}
                showEffects={false}
            />
        </div>
    );
}

const STEPS = [
    {
        icon: MapIcon,
        title: "Solve a problem",
        body: "Click a province to open its LeetCode problem. Accepted submissions plant your flag.",
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
            className="min-h-screen text-[#f4e7d8]"
            style={{
                background:
                    "linear-gradient(180deg, #17110d 0%, #100c09 44%, #130f0c 100%)",
            }}
        >
            <header className="sticky top-0 z-40 border-b border-[#3f332d] bg-[#130f0c]/90 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
                    <Logo className="text-[1.08rem]" />
                    <div className="flex items-center gap-4">
                        <a href="#how" className="hidden text-sm text-[#a8917d] transition hover:text-[#f4e7d8] sm:block">
                            How it works
                        </a>
                        <a href="#features" className="hidden text-sm text-[#a8917d] transition hover:text-[#f4e7d8] sm:block">
                            Features
                        </a>
                        <GoogleButton
                            onLogin={onLogin}
                            isRedirecting={isRedirecting}
                            className={`!w-auto !px-4 !py-2 ${googleButtonClassName}`}
                        />
                    </div>
                </div>
            </header>

            <section className="relative mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
                <div className="relative">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#7a5136] bg-[#211a16] px-3 py-1 text-xs font-semibold text-[#e8b691]">
                        Free - play with friends
                    </span>
                    <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
                        Solve LeetCode.
                        <br />
                        <span className="text-[#e6a15d]">Capture the map.</span>
                    </h1>
                    <p className="mt-5 max-w-md text-base leading-relaxed text-[#a8917d]">
                        Turn your daily grind into a live territory battle. Plant flags, steal provinces,
                        and keep a streak that never lets you quit.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <GoogleButton
                            onLogin={onLogin}
                            isRedirecting={isRedirecting}
                            className={`sm:!w-auto sm:!px-8 sm:!py-3.5 ${googleButtonClassName}`}
                        />
                        <a
                            href="#how"
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#5a4235] bg-[#1b1512]/60 px-6 py-3.5 text-sm font-semibold text-[#f4e7d8] transition hover:border-[#e6a15d]/60 hover:bg-[#211a16]"
                        >
                            See how it works
                        </a>
                    </div>
                    {errorMessage ? (
                        <p className="mt-4 max-w-sm rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {errorMessage}
                        </p>
                    ) : null}
                    <p className="mt-6 text-xs text-[#7a6b5e]">
                        An independent project, not affiliated with LeetCode.
                    </p>
                </div>

                <div className="relative">
                    <div className="overflow-hidden rounded-xl border border-[#3f332d] bg-[#211a16] shadow-2xl shadow-black/45">
                        <HeroMap />
                    </div>
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-xl"
                        style={{ boxShadow: "inset 0 0 90px rgba(24, 12, 5, 0.72)" }}
                    />
                </div>
            </section>

            <section id="how" className="mx-auto max-w-6xl px-6 py-16">
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

            <section id="features" className="mx-auto max-w-6xl px-6 py-16">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.3em] text-[#e6a15d]">
                    Features
                </p>
                <h2 className="mt-3 text-center text-3xl font-bold tracking-tight text-[#f4e7d8] sm:text-4xl">
                    Built for the grind
                </h2>
                <div className="mt-10 grid gap-5 sm:grid-cols-2">
                    {FEATURES.map((feature, index) => {
                        const accent = FEATURE_ACCENTS[index % FEATURE_ACCENTS.length];
                        return (
                            <div
                                key={feature.title}
                                className="flex gap-4 rounded-xl border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/15 transition hover:border-[#e6a15d]/40"
                            >
                                <span
                                    className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-lg"
                                    style={{
                                        border: `1px solid ${accent}66`,
                                        backgroundColor: `${accent}18`,
                                        color: accent,
                                    } as CSSProperties}
                                >
                                    <feature.icon size={20} />
                                </span>
                                <div>
                                    <h3 className="font-semibold text-[#f4e7d8]">{feature.title}</h3>
                                    <p className="mt-1 text-sm leading-relaxed text-[#a8917d]">{feature.body}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="relative mx-auto max-w-3xl px-6 py-20 text-center">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10"
                    style={{
                        background:
                            "linear-gradient(180deg, transparent 0%, rgba(90, 66, 53, 0.12) 52%, transparent 100%)",
                    }}
                />
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
                        className={`!py-3.5 ${googleButtonClassName}`}
                    />
                    {errorMessage ? (
                        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {errorMessage}
                        </p>
                    ) : null}
                </div>
            </section>

            <Footer />
        </main>
    );
}
