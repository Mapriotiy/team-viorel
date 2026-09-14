import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "./api/client";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";

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
    const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

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

    const handleLinkChanged = useCallback(() => {
        // LeetCode linking completed — refresh the cached identity so the
        // dashboard immediately reflects the newly verified account.
        void apiRequest<User>("/auth/me")
            .then(setUser)
            .catch(() => {});
        setDashboardRefreshKey((key) => key + 1);
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
            <DashboardPage
                user={user}
                refreshKey={dashboardRefreshKey}
                onLogout={handleLogout}
                onLinkChanged={handleLinkChanged}
            />
        );
    }

    return screen;
}