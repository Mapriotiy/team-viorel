import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link2, LogOut, MapPin } from "lucide-react";
import { apiRequest } from "./api/client";
import { LeetCodeLinkModal } from "./components/LeetCodeLinkModal";
import { OnboardingOverlay, isOnboarded, markOnboarded } from "./components/OnboardingOverlay";
import { AuthPage } from "./pages/AuthPage";

type User = {
    id: number;
    google_sub: string | null;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
    leetcode_username: string | null;
    leetcode_verified_at: string | null;
    is_admin: boolean;
    is_banned: boolean;
};

const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;

// Guards against the OAuth callback being processed twice (StrictMode remounts).
const processedOAuthStates = new Set<string>();

export default function App() {
    return <MainApp />;
}

function MainApp() {
    const [user, setUser] = useState<User | null>(null);
    const [isLoadingSession, setIsLoadingSession] = useState(true);
    const [sessionStalled, setSessionStalled] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [showLeetCodeLink, setShowLeetCodeLink] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(false);

    function clearUrlParam(param: string) {
        const url = new URL(window.location.href);
        url.searchParams.delete(param);
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    }

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");

        async function bootstrap() {
            if (code && state && !processedOAuthStates.has(state)) {
                processedOAuthStates.add(state);
                try {
                    await apiRequest<{ access_token: string }>("/auth/google/code", {
                        method: "POST",
                        body: JSON.stringify({ code, state }),
                    });
                    clearUrlParam("code");
                    clearUrlParam("state");
                    setAuthError(null);
                    const me = await apiRequest<User>("/auth/me");
                    setUser(me);
                    return;
                } catch (e) {
                    void apiRequest("/auth/logout", { method: "POST" });
                    clearUrlParam("code");
                    clearUrlParam("state");
                    setAuthError(
                        e instanceof Error ? e.message : "Google sign-in failed. Please try again.",
                    );
                }
            }

            try {
                const me = await apiRequest<User>("/auth/me");
                setUser(me);
                if (!isOnboarded()) {
                    setShowOnboarding(true);
                }
            } catch {
                setUser(null);
            }
        }

        void bootstrap().finally(() => setIsLoadingSession(false));
    }, []);

    // Only surface the loader if session bootstrap is genuinely slow; fast
    // loads should paint straight into the auth page without a flash.
    useEffect(() => {
        const stallTimer = window.setTimeout(() => setSessionStalled(true), 200);
        return () => window.clearTimeout(stallTimer);
    }, []);

    useEffect(() => {
        function pingBackend() {
            apiRequest<{ status: string }>("/health").catch(() => {});
        }
        pingBackend();
        const intervalId = window.setInterval(pingBackend, KEEP_ALIVE_INTERVAL_MS);
        return () => window.clearInterval(intervalId);
    }, []);

    const handleLogout = useCallback(() => {
        void apiRequest("/auth/logout", { method: "POST" });
        setUser(null);
    }, []);

    if (isLoadingSession) {
        return sessionStalled ? (
            <main className="min-h-screen bg-[#0f0d0b] p-6 text-white">
                Loading...
            </main>
        ) : null;
    }

    let screen: ReactNode;

    if (!user) {
        screen = (
            <AuthPage
                initialError={authError}
                onClearError={() => setAuthError(null)}
            />
        );
    } else {
        screen = (
            <main className="min-h-screen bg-[#0f0d0b] px-6 py-10 text-[#eff1f6]">
                <div className="mx-auto max-w-3xl">
                    <header className="mb-8 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {user.avatar_url ? (
                                <img
                                    src={user.avatar_url}
                                    alt=""
                                    className="h-10 w-10 rounded-full border border-[#3a342e]"
                                />
                            ) : (
                                <span className="grid h-10 w-10 place-items-center rounded-full border border-[#3a342e] bg-[#211a16] text-sm font-bold text-[#e6a15d]">
                                    {(user.display_name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
                                </span>
                            )}
                            <div>
                                <p className="text-sm font-semibold">{user.display_name ?? "You"}</p>
                                <p className="text-xs text-[#8f8278]">{user.email}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleLogout}
                            className="inline-flex items-center gap-2 rounded-md border border-[#3a342e] px-3 py-2 text-sm text-[#b3a89c] transition hover:border-red-400/60 hover:text-red-200"
                        >
                            <LogOut size={15} />
                            Log out
                        </button>
                    </header>

                    <div className="rounded-xl border border-[#2e2a26] bg-[#151210] p-8">
                        <h1 className="text-2xl font-black tracking-tight">
                            Welcome to <span className="text-[#e6a15d]">StreakMap</span>
                        </h1>
                        <p className="mt-2 max-w-md text-sm leading-relaxed text-[#9d8f80]">
                            Link your LeetCode account to start tracking your streak and capturing
                            the map.
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setShowLeetCodeLink(true)}
                                className="inline-flex items-center gap-2 rounded-md bg-[#e6a15d] px-4 py-2.5 text-sm font-semibold text-[#1d120c] transition hover:bg-[#d87a38]"
                            >
                                <Link2 size={16} />
                                {user.leetcode_verified_at ? "Manage LeetCode account" : "Link LeetCode account"}
                            </button>
                            {user.leetcode_username ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#3a342e] bg-[#211a16] px-3 py-2 text-sm text-[#b8e0b1]">
                                    <MapPin size={14} />
                                    {user.leetcode_username}
                                </span>
                            ) : null}
                        </div>
                    </div>
                </div>

                {showLeetCodeLink ? (
                    <LeetCodeLinkModal
                        onClose={() => setShowLeetCodeLink(false)}
                        onChanged={() => {
                            void apiRequest<User>("/auth/me").then(setUser);
                        }}
                    />
                ) : null}

                {showOnboarding ? (
                    <OnboardingOverlay
                        onClose={() => {
                            markOnboarded();
                            setShowOnboarding(false);
                        }}
                    />
                ) : null}
            </main>
        );
    }

    return screen;
}