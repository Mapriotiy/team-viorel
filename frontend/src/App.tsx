import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { apiRequest } from "./api/client";
import { clearCache } from "./api/localCache";
import { InviteModal } from "./components/InviteModal";
import { Background } from "./components/Background";
import { ToastProvider } from "./components/toast/ToastProvider";
import { AuthPage } from "./pages/AuthPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReplayPage } from "./pages/ReplayPage";
import { LobbyPage } from "./pages/LobbyPage";
import { LobbyGamePage } from "./pages/LobbyGamePage";
import { AdminPage } from "./pages/AdminPage";
import { MapTestPage } from "./pages/MapTestPage";
import { MainPage } from "./pages/MainPage";
import type { Faction, LobbyPlayer } from "./types/dashboard";

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
    const params = new URLSearchParams(window.location.search);
    const isMapTest = params.get("mapTest") === "1";
    const replayParam = params.get("replay");
    return (
        <ToastProvider>
            <Background />
            {isMapTest ? (
                <MapTestPage />
            ) : replayParam ? (
                <ReplayPage replayToken={replayParam} />
            ) : (
                <MainApp />
            )}
        </ToastProvider>
    );
}

function MainApp() {
    const [user, setUser] = useState<User | null>(null);
    const [isLoadingSession, setIsLoadingSession] = useState(true);
    const [sessionStalled, setSessionStalled] = useState(false);
    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [lobbyInviteToken, setLobbyInviteToken] = useState<string | null>(null);
    const [showAdmin, setShowAdmin] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const [activeLobbyId, setActiveLobbyId] = useState<number | null>(null);
    const [activeLobbyPlayers, setActiveLobbyPlayers] = useState<LobbyPlayer[]>([]);
    const [activeLobbyFactions, setActiveLobbyFactions] = useState<Faction[]>([]);
    const [authError, setAuthError] = useState<string | null>(null);

    const navDepthRef = useRef(0);

    type NavState = {
        screen?: "admin" | "profile" | "lobby" | "game";
        lobbyId?: number;
        players?: LobbyPlayer[];
        factions?: Faction[];
    };

    const applyNavState = useCallback((state: NavState | null) => {
        const screen = state?.screen;
        setShowAdmin(false);
        setShowProfile(false);
        if (screen === "admin") {
            setActiveLobbyId(null);
            setActiveLobbyPlayers([]);
            setActiveLobbyFactions([]);
            setShowAdmin(true);
            return;
        }
        if (screen === "profile") {
            setActiveLobbyId(null);
            setActiveLobbyPlayers([]);
            setActiveLobbyFactions([]);
            setShowProfile(true);
            return;
        }
        if (screen === "game" && state?.lobbyId != null) {
            setActiveLobbyId(state.lobbyId);
            setActiveLobbyPlayers(state.players ?? []);
            setActiveLobbyFactions(state.factions ?? []);
            return;
        }
        if (screen === "lobby" && state?.lobbyId != null) {
            setActiveLobbyId(state.lobbyId);
            setActiveLobbyPlayers([]);
            setActiveLobbyFactions([]);
            return;
        }
        setActiveLobbyId(null);
        setActiveLobbyPlayers([]);
        setActiveLobbyFactions([]);
    }, []);

    const pushNav = useCallback(
        (state: NavState) => {
            navDepthRef.current += 1;
            window.history.pushState(state, "");
            applyNavState(state);
        },
        [applyNavState],
    );

    const goRoot = useCallback(() => {
        navDepthRef.current = 0;
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        applyNavState(null);
    }, [applyNavState]);

    const goBack = useCallback(() => {
        if (navDepthRef.current > 0) {
            window.history.back();
        } else {
            applyNavState(null);
        }
    }, [applyNavState]);

    useEffect(() => {
        const onPopState = (event: PopStateEvent) => {
            // States pushed by MainPage are namespaced under __mp and handled
            // inside MainPage — don't let them drive MainApp navigation.
            if (event.state && typeof event.state === "object" && "__mp" in event.state) {
                return;
            }
            navDepthRef.current = Math.max(0, navDepthRef.current - 1);
            applyNavState(event.state as NavState | null);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [applyNavState]);

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
                    const pendingInviteToken = localStorage.getItem("pendingInviteToken");
                    if (pendingInviteToken) setInviteToken(pendingInviteToken);
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
            void apiRequest("/auth/logout", { method: "POST" });
                clearCache();
                setUser(null);
            }
        }

        void bootstrap().finally(() => setIsLoadingSession(false));
    }, []);

    // Only surface the loader if session bootstrap is genuinely slow; fast
    // loads should paint straight into the dashboard without a flash.
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

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const tokenFromUrl = params.get("invite");
        const lobbyToken = params.get("lobby");
        const pendingInviteToken = localStorage.getItem("pendingInviteToken");

        if (lobbyToken) {
            setLobbyInviteToken(lobbyToken);
            return;
        }

        if (tokenFromUrl) {
            setInviteToken(tokenFromUrl);
            localStorage.setItem("pendingInviteToken", tokenFromUrl);
            return;
        }

        if (pendingInviteToken) {
            setInviteToken(pendingInviteToken);
        }
    }, []);

    const handleAcceptedLobbyInvite = async (lobbyId: number) => {
        localStorage.removeItem("pendingLobbyInviteToken");
        setLobbyInviteToken(null);
        clearUrlParam("lobby");
        let finalLobbyId = lobbyId;
        try {
            const data = await apiRequest<{ lobby: { id: number }; invite_url: string }>(`/lobbies/${lobbyId}`);
            finalLobbyId = data.lobby?.id ?? lobbyId;
        } catch {}
        pushNav({ screen: "lobby", lobbyId: finalLobbyId });
    };

    if (isLoadingSession) {
        return sessionStalled ? (
            <main className="min-h-screen bg-transparent p-6 text-white">
                Loading...
            </main>
        ) : null;
    }

    let screen: ReactNode;
    let screenKey: string;

    if (!user) {
        screenKey = "auth";
        screen = (
            <AuthPage
                initialError={authError}
                onClearError={() => setAuthError(null)}
            />
        );
    } else if (activeLobbyId && activeLobbyPlayers.length > 0) {
        screenKey = "game";
        screen = (
            <LobbyGamePage
                lobbyId={activeLobbyId}
                currentUserId={user.id}
                players={activeLobbyPlayers}
                factions={activeLobbyFactions}
                isAdmin={user.is_admin}
                onBack={goBack}
                onReplay={() => {
                    goRoot();
                    
                }}
                onLeft={() => {
                    goRoot();
                    
                }}
            />
        );
    } else if (activeLobbyId) {
        screenKey = "lobby";
        screen = (
            <LobbyPage
                lobbyId={activeLobbyId}
                currentUserId={user.id}
                currentUserVerified={user.leetcode_verified_at != null}
                onBack={() => {
                    goBack();
                    
                }}
                onGameStarted={(lobbyId, players, factions) => {
                    pushNav({ screen: "game", lobbyId, players, factions });
                }}
            />
        );
    } else if (showAdmin && user.is_admin) {
        screenKey = "admin";
        screen = (
            <AdminPage
                onBack={goBack}
                onLogout={() => {
                    void apiRequest("/auth/logout", { method: "POST" });
                    clearCache();
                    setUser(null);
                    setShowAdmin(false);
                }}
            />
        );
    } else if (showProfile) {
        screenKey = "profile";
        screen = (
            <ProfilePage
                onBack={goBack}
                onLogout={() => {
                    void apiRequest("/auth/logout", { method: "POST" });
                    clearCache();
                    setUser(null);
                    setShowProfile(false);
                }}
            />
        );
    } else {
        screenKey = "dashboard";
        screen = (
            <>
                <MainPage />

                {inviteToken ? (
                    <InviteModal
                        token={inviteToken}
                        user={user}
                        onClose={() => {
                            localStorage.removeItem("pendingInviteToken");
                            setInviteToken(null);
                            clearUrlParam("invite");
                        }}
                        onAccepted={() => {
                            localStorage.removeItem("pendingInviteToken");
                            setInviteToken(null);
                            clearUrlParam("invite");
                            
                        }}
                        onNeedAuth={() => {
                            setInviteToken(null);
                            clearUrlParam("invite");
                        }}
                    />
                ) : null}

                {lobbyInviteToken ? (
                    <LobbyInviteModal
                        token={lobbyInviteToken}
                        onBack={() => {
                            setLobbyInviteToken(null);
                            clearUrlParam("lobby");
                        }}
                        onAccepted={handleAcceptedLobbyInvite}
                    />
                ) : null}
            </>
        );
    }

    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div
                key={screenKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
            >
                {screen}
            </motion.div>
        </AnimatePresence>
    );
}

function LobbyInviteModal({ token, onBack, onAccepted }: {
    token: string;
    onBack: () => void;
    onAccepted: (lobbyId: number) => void;
}) {
    const [info, setInfo] = useState<{
        lobby_id: number;
        lobby_name: string;
        creator_username: string;
        player_count: number;
        max_players: number;
        faction_mode: boolean;
        faction_count: number;
        programming_language: string;
        status: string;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiRequest<typeof info>(`/lobbies/invites/${token}`)
            .then(setInfo)
            .catch(() => setError("Invite not found"))
            .finally(() => setLoading(false));
    }, [token]);

    const handleAccept = async () => {
        setAccepting(true);
        try {
            const res = await apiRequest<{ id: number }>(`/lobbies/invites/${token}/accept`, { method: "POST" });
            onAccepted(res.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to accept");
        } finally {
            setAccepting(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="w-full max-w-sm rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 text-center text-sm text-[#8a8a8a] shadow-2xl">
                    Loading invite...
                </div>
            </div>
        );
    }

    if (error || !info) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                <div className="w-full max-w-sm rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 text-center shadow-2xl">
                    <p className="text-sm text-red-400">{error ?? "Invite not found"}</p>
                    <button type="button" onClick={onBack} className="mt-4 rounded-md border border-[#3a3a3a] bg-[#333] px-4 py-2 text-sm text-[#d7d7d7]">Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-sm rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-2xl">
                <h2 className="text-lg font-semibold text-white">Lobby Invite</h2>
                <p className="mt-2 text-sm text-[#b3b3b3]">
                    <span className="text-[#c86f3c]">{info.creator_username}</span> invited you to <strong className="text-white">{info.lobby_name}</strong>
                </p>
                <p className="mt-1 text-xs text-[#8a8a8a]">
                    {info.faction_mode
                        ? `${info.player_count} players, ${info.faction_count} factions`
                        : `${info.player_count}/${info.max_players} players`}
                    {", "}
                    {info.programming_language}
                    {" - "}
                    {info.status === "active" ? "Game in progress" : "Waiting"}
                </p>
                {accepting ? (
                    <p className="mt-4 text-sm text-[#8a8a8a]">Accepting...</p>
                ) : error ? (
                    <p className="mt-2 text-sm text-red-400">{error}</p>
                ) : (
                    <div className="mt-4 flex gap-2">
                        <button type="button" onClick={onBack} className="flex-1 rounded-md border border-[#3a3a3a] bg-[#333] px-4 py-2 text-sm text-[#d7d7d7]">Back</button>
                        <button type="button" onClick={handleAccept} className="flex-1 rounded-md bg-[#c86f3c] px-4 py-2 text-sm font-semibold text-[#111]">Accept</button>
                    </div>
                )}
            </div>
        </div>
    );
}
