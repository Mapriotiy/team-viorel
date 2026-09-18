import { Flame, Map, Users } from "lucide-react";
import { Footer } from "../../components/Footer";
import { GoogleButton } from "./GoogleButton";
import { Logo } from "../../components/Logo";
import type { AuthFormProps } from "./useGoogleLogin";

const MAP_BG = `${import.meta.env.BASE_URL}map-bg.webp`;

const FEATURES = [
    {
        icon: Map,
        title: "Turn solves into territory",
        body: "Every accepted problem plants your flag on a province. Beat runtimes to steal the map.",
    },
    {
        icon: Users,
        title: "Play with friends",
        body: "Create lobbies, form factions, and race your friends to own the map.",
    },
    {
        icon: Flame,
        title: "Streaks that stick",
        body: "Daily solves keep your streak — and your color — spreading across the board.",
    },
];

export function AuthV3({ errorMessage, isRedirecting, onLogin }: AuthFormProps) {
    return (
        <main className="flex min-h-screen flex-col bg-[#0d0e0f] text-white">
            <div className="flex flex-1 flex-col md:flex-row">
                {/* Feature panel */}
                <section className="relative hidden flex-[3] flex-col justify-center overflow-hidden border-r border-white/5 bg-gradient-to-br from-[#16171a] to-[#0d0e0f] px-14 py-12 md:flex">
                    <Logo className="mb-12 text-[1.2rem]" />

                    <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
                        Solve. <span className="text-[#c86f3c]">Capture.</span> Conquer.
                    </h1>
                    <p className="mt-3 max-w-md text-sm leading-relaxed text-[#8a8a8a]">
                        A LeetCode-powered territory game. The more you solve, the more
                        of the map you own.
                    </p>

                    <div className="mt-10 space-y-6">
                        {FEATURES.map((feature) => (
                            <div key={feature.title} className="flex gap-4">
                                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-[#00d9ff]">
                                    <feature.icon size={18} />
                                </span>
                                <div>
                                    <p className="font-semibold text-[#eff1f6]">{feature.title}</p>
                                    <p className="mt-1 max-w-sm text-sm text-[#8a8a8a]">{feature.body}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Login form */}
                <section className="relative flex flex-[5] flex-col items-center justify-center overflow-hidden px-6 py-14">
                    <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url(${MAP_BG})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            filter: "blur(10px) brightness(0.45) saturate(0.85)",
                            animation: "slow-zoom 34s ease-in-out infinite alternate",
                        }}
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background:
                                "radial-gradient(70% 60% at 50% 40%, transparent 40%, rgba(10,11,13,0.65) 100%)",
                        }}
                    />

                    <Logo className="relative z-10 mb-8 text-[1.2rem] md:hidden" />

                    <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/10 bg-[#141519]/70 p-7 shadow-2xl shadow-black/50 backdrop-blur-md">
                        <h2 className="text-2xl font-semibold tracking-tight">
                            Welcome to Cinnamon Code
                        </h2>
                        <p className="mt-2 text-sm text-[#b3b3b3]">
                            Sign in to continue your conquest.
                        </p>

                        <div className="mt-8">
                            <GoogleButton onLogin={onLogin} isRedirecting={isRedirecting} />
                        </div>

                        {errorMessage ? (
                            <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-sm text-red-200">
                                {errorMessage}
                            </p>
                        ) : null}

                        <p className="mt-6 text-center text-xs text-[#8a8a8a]">
                            You'll link your LeetCode account after signing in.
                        </p>
                    </div>
                </section>
            </div>

            <Footer />
        </main>
    );
}
