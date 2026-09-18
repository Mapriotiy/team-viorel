import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Gamepad2, Link2, LogOut, Shield, UserCircle } from "lucide-react";
import { apiRequest } from "../api/client";
import { dashboardCacheKey, readCache, writeCache } from "../api/localCache";
import { ActivityCalendar } from "../components/dashboard/ActivityCalendar";
import { FriendFlame } from "../components/dashboard/FriendFlame";
import { FriendsList } from "../components/dashboard/FriendsList";
import { CreateLobbyModal } from "../components/CreateLobbyModal";
import { LeetCodeLinkModal } from "../components/LeetCodeLinkModal";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Footer } from "../components/Footer";
import { Logo } from "../components/Logo";
import { OnboardingOverlay, isOnboarded } from "../components/OnboardingOverlay";
import { DIFFICULTY_COLORS } from "../mapRegions";
import type { DashboardData, Faction, FriendResponse, LobbyPlayer } from "../types/dashboard";

type User = {
    id: number;
    leetcode_username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    leetcode_verified_at: string | null;
    is_admin?: boolean;
};

type DashboardPageProps = {
    user: User;
    refreshKey: number;
    onLogout: () => void;
    onOpenLobby: (lobbyId: number, players?: LobbyPlayer[], factions?: Faction[]) => void;
    onLinkChanged: () => void;
    onOpenAdmin: () => void;
    onOpenProfile: () => void;
};

// Bump when DashboardData's shape changes so stale-shaped cache is dropped.
const DASHBOARD_CACHE_VERSION = 1;

const LANGUAGE_LABELS: Record<string, string> = {
    python3: "Python 3",
    cpp: "C++",
    java: "Java",
    javascript: "JavaScript",
    typescript: "TypeScript",
    csharp: "C#",
    golang: "Go",
    rust: "Rust",
};

function SkeletonBlock({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse rounded-md bg-[#2a2a2a] ${className}`} />;
}

function DashboardSkeleton() {
    return (
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-3 rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-xl shadow-black/20">
                <SkeletonBlock className="h-4 w-20" />
                <SkeletonBlock className="h-3 w-32" />
                <SkeletonBlock className="mt-3 h-12 w-full" />
                <SkeletonBlock className="h-12 w-full" />
                <SkeletonBlock className="h-9 w-32" />
            </div>
            <div className="rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-xl shadow-black/20">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-4 h-40 w-full" />
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-xl shadow-black/20">
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="mt-3 h-12 w-full" />
                <SkeletonBlock className="h-12 w-full" />
                <SkeletonBlock className="h-12 w-full" />
            </div>
        </section>
    );
}

export function DashboardPage({ user, refreshKey, onLogout, onOpenLobby, onLinkChanged, onOpenAdmin, onOpenProfile }: DashboardPageProps) {
    // Seed from the last-seen dashboard so returning to the menu paints instantly
    // instead of showing the "Loading dashboard..." placeholder (issue #1).
    const cachedDashboard = readCache<DashboardData>(
        dashboardCacheKey(user.id),
        DASHBOARD_CACHE_VERSION,
    );
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(
        cachedDashboard?.data ?? null,
    );
    const [friends, setFriends] = useState<FriendResponse[]>(
        cachedDashboard?.data.friends ?? [],
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showLobbyModal, setShowLobbyModal] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(() => !isOnboarded());
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (event: MouseEvent) => {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        };
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);
    const isLeetcodeLinked = user.leetcode_verified_at != null;
    const currentStreakState = dashboardData?.current_streak_state ?? "broken";
    const isCurrentStreakLit = currentStreakState === "lit";
    const currentStreakHint =
        currentStreakState === "lit"
            ? "Active today"
            : currentStreakState === "pending"
              ? "Waiting for today's solve"
              : "Solve today to start";

    const loadDashboard = useCallback(async () => {
        setErrorMessage(null);

        try {
            const dashboard = await apiRequest<DashboardData>("/dashboard/");

            setDashboardData(dashboard);
            setFriends(dashboard.friends ?? []);
            writeCache(dashboardCacheKey(user.id), DASHBOARD_CACHE_VERSION, dashboard);
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : "Failed to load dashboard",
            );
        }
    }, [user.id]);

    useEffect(() => {
        // Revalidate immediately, then quietly again after a short delay.
        void loadDashboard();
        const refreshId = window.setTimeout(() => {
            void loadDashboard();
        }, 2500);
        return () => window.clearTimeout(refreshId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadDashboard, refreshKey]);

    const handleLinkChanged = useCallback(() => {
        setShowLinkModal(false);
        onLinkChanged();
        void loadDashboard();
    }, [onLinkChanged, loadDashboard]);

    const displayName = dashboardData?.display_name ?? user.display_name;
    const headerName = isLeetcodeLinked
        ? (dashboardData?.leetcode_username ?? user.leetcode_username ?? "LeetCode player")
        : (displayName ?? "Welcome");

    return (
        <main className="min-h-screen bg-transparent p-4 text-white sm:p-6">
                <header className="sticky top-0 z-20 -mx-4 -mt-4 mb-6 border-b border-[#2a2a2a] bg-[#1a1a1a]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
                    <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
                        <Logo className="text-[1.05rem] sm:text-[1.16rem]" />

                        <div className="flex items-center gap-3">
                            {isLeetcodeLinked ? (
                                <div className="hidden items-center gap-1.5 sm:flex">
                                    <span
                                        className={`text-xs ${
                                            isCurrentStreakLit ? "text-[#c86f3c]" : "text-[#8a8a8a]"
                                        }`}
                                    >
                                        {currentStreakHint}
                                    </span>
                                    <FriendFlame
                                        count={dashboardData?.current_streak ?? 0}
                                        state={currentStreakState}
                                        size="xs"
                                    />
                                </div>
                            ) : null}

                            <div className="relative" ref={profileMenuRef}>
                                <button
                                    type="button"
                                    onClick={() => setProfileMenuOpen((value) => !value)}
                                    className="group flex min-w-0 items-center gap-2.5 rounded-md border border-[#4a4a4a] bg-[#333333] px-2.5 py-1.5 text-left transition hover:bg-[#3d3d3d] focus:outline-none focus:ring-2 focus:ring-[#c86f3c]/30"
                                >
                                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-[#4a4a4a] bg-[#262626] text-[#b3b3b3] transition group-hover:text-[#d7d7d7]">
                                        {(dashboardData?.avatar_url ?? user.avatar_url) ? (
                                            <img
                                                src={dashboardData?.avatar_url ?? user.avatar_url ?? ""}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <UserCircle size={22} strokeWidth={1.8} />
                                        )}
                                    </span>

                                    <span className="hidden min-w-0 max-w-[10rem] leading-tight sm:block">
                                        <span className="block text-[11px] font-medium uppercase tracking-wide text-[#8a8a8a]">
                                            Profile
                                        </span>
                                        <span className="block truncate text-sm font-semibold text-[#eff1f6]">
                                            {headerName}
                                        </span>
                                    </span>
                                    <ChevronDown
                                        size={16}
                                        className={`hidden shrink-0 text-[#8a8a8a] transition sm:block ${
                                            profileMenuOpen ? "rotate-180" : ""
                                        }`}
                                    />
                                </button>

                                {profileMenuOpen ? (
                                    <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-lg border border-[#3a3a3a] bg-[#1e1f22] py-1 shadow-2xl shadow-black/40">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setProfileMenuOpen(false);
                                                onOpenProfile();
                                            }}
                                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-[#eff1f6] transition hover:bg-[#2a2a2a]"
                                        >
                                            <UserCircle size={15} />
                                            View profile
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setProfileMenuOpen(false);
                                                onLogout();
                                            }}
                                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-300 transition hover:bg-[#2a2a2a]"
                                        >
                                            <LogOut size={15} />
                                            Logout
                                        </button>
                                    </div>
                                ) : null}
                            </div>

                            {user.is_admin && (
                                <button
                                    type="button"
                                    onClick={onOpenAdmin}
                                    title="Admin panel"
                                    className="grid h-10 w-10 place-items-center rounded-md border border-[#4a4a4a] bg-[#333333] text-[#d7d7d7] transition hover:border-[#c86f3c]/60 hover:text-[#c86f3c]"
                                >
                                    <Shield size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </header>

            <div className="mx-auto max-w-5xl">
                {!isLeetcodeLinked ? (
                    <section className="mt-6 rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-xl shadow-black/20">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold">Link LeetCode to start tracking solves</h2>
                                <p className="mt-1 text-sm text-[#8a8a8a]">
                                    Verify ownership of your LeetCode account with an Accepted Two Sum submission.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowLinkModal(true)}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#c86f3c] px-4 py-2.5 text-sm font-semibold text-[#111] transition hover:bg-[#d9823f]"
                            >
                                <Link2 size={16} />
                                Link LeetCode
                            </button>
                        </div>
                    </section>
                ) : null}

                {errorMessage ? (
                    <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {errorMessage}
                    </div>
                ) : null}

                {!dashboardData ? (
                    <DashboardSkeleton />
                ) : (
                <section className="mt-6 grid gap-4 sm:grid-cols-3">
                        <article className="flex flex-col rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-xl shadow-black/20 transition hover:border-[#c86f3c]/40 hover:shadow-[0_0_35px_-8px_rgba(200,111,60,0.28)]">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-[#a3a3a3]">Lobby</p>
                                    <p className="mt-1 text-xs text-[#8a8a8a]">Create or rejoin games</p>
                                </div>
                                <span className="rounded-full bg-[#333333] px-2.5 py-1 text-xs font-semibold text-[#c86f3c]">
                                    <AnimatedNumber value={dashboardData?.lobbies.length ?? 0} />
                                </span>
                            </div>

                            <div className="mt-4 flex min-h-0 max-h-[13.25rem] flex-col gap-2 overflow-y-auto pr-1">
                                {!dashboardData?.lobbies.length ? (
                                    <p className="text-sm text-[#8a8a8a]">No active lobbies yet.</p>
                                ) : (
                                    dashboardData.lobbies.map((lobby) => {
                                        const isActive = lobby.status === "active";
                                        return (
                                            <button
                                                key={lobby.id}
                                                type="button"
                                                onClick={() => onOpenLobby(lobby.id, isActive ? lobby.players : undefined, lobby.factions)}
                                                className="rounded-md border border-[#3a3a3a] bg-[#1f1f1f] px-3 py-2 text-left text-sm transition hover:border-[#c86f3c]/60 hover:text-[#c86f3c]"
                                            >
                                                <span className="block truncate font-medium text-[#eff1f6]">
                                                    {lobby.name}
                                                </span>
                                                <span className="mt-1 flex items-center justify-between gap-2 text-xs text-[#8a8a8a]">
                                                    <span>
                                                        {lobby.faction_mode
                                                            ? `${lobby.players.length} players, ${lobby.faction_count} factions`
                                                            : `${lobby.players.length}/${lobby.max_players} players`}
                                                        {", "}
                                                        {LANGUAGE_LABELS[lobby.programming_language] ?? lobby.programming_language}
                                                    </span>
                                                    <span className={isActive ? "text-[#c86f3c]" : "text-[#a3a3a3]"}>
                                                        {isActive ? "Open map" : "Waiting"}
                                                    </span>
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>

                            <div className="mt-auto flex flex-col gap-2">
                                {isLeetcodeLinked ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowLobbyModal(true)}
                                        className="mt-4 rounded-md bg-[#c86f3c] px-4 py-2.5 text-sm font-semibold text-[#111] transition hover:bg-[#d9823f]"
                                    >
                                        <Gamepad2 size={16} className="inline-block mr-2" />
                                        Create Lobby
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setShowLinkModal(true)}
                                        className="mt-4 rounded-md bg-[#c86f3c] px-4 py-2.5 text-sm font-semibold text-[#111] transition hover:bg-[#d9823f]"
                                    >
                                        <Link2 size={16} className="inline-block mr-2" />
                                        Link LeetCode to play
                                    </button>
                                )}
                            </div>
                        </article>

                        <ActivityCalendar
                            activityCalendar={dashboardData?.activity_calendar ?? []}
                            activeDaysCount={dashboardData?.active_days_count ?? 0}
                        />

                        <article className="flex flex-col rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-xl shadow-black/20 transition hover:border-[#c86f3c]/40 hover:shadow-[0_0_35px_-8px_rgba(200,111,60,0.28)]">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-[#a3a3a3]">
                                        Today's solved
                                    </p>
                                    <p className="mt-1 text-xs text-[#8a8a8a]">
                                        Unique accepted problems
                                    </p>
                                </div>

                                <span className="rounded-full bg-[#333333] px-2.5 py-1 text-xs font-semibold text-[#c86f3c]">
                                    <AnimatedNumber value={dashboardData?.today_submissions.length ?? 0} />
                                </span>
                            </div>

                            <div className="mt-4 flex min-h-0 max-h-[15rem] flex-col gap-2 overflow-y-auto pr-1">
                                {!dashboardData?.today_submissions.length ? (
                                    <div className="flex flex-col items-center gap-2 py-8 text-[#6b6b6b]">
                                        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path opacity="0.4" d="M11 19.5H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path opacity="0.4" d="M11 12.5H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path opacity="0.4" d="M11 5.5H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M3 5.5L4 6.5L7 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M3 12.5L4 13.5L7 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M3 19.5L4 20.5L7 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <p className="text-sm text-[#8a8a8a]">
                                            No accepted submissions yet.
                                        </p>
                                    </div>
                                ) : (
                                    dashboardData.today_submissions.map((submission) => (
                                        <a
                                            key={submission.title_slug}
                                            href={submission.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block rounded-md border px-3 py-2 text-sm text-[#eff1f6] transition hover:border-[#c86f3c]/60 hover:text-[#c86f3c]"
                                            style={{
                                                borderColor: submission.difficulty
                                                    ? DIFFICULTY_COLORS[submission.difficulty] ?? "#3a3a3a"
                                                    : "#3a3a3a",
                                            }}
                                        >
                                            <span className="block truncate font-medium">
                                                {submission.title}
                                            </span>
                                            {(submission.difficulty || submission.topic_tags?.length) ? (
                                                <span className="mt-1 flex items-center gap-1.5 text-xs">
                                                    {submission.difficulty ? (
                                                        <span
                                                            className="font-medium"
                                                            style={{
                                                                color: DIFFICULTY_COLORS[submission.difficulty] ?? "#aaa",
                                                            }}
                                                        >
                                                            {submission.difficulty}
                                                        </span>
                                                    ) : null}
                                                    {(submission.topic_tags ?? []).map((tag) => (
                                                        <span
                                                            key={tag}
                                                            className="rounded-full bg-[#333] px-2 py-0.5 text-[#aaa]"
                                                        >
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </span>
                                            ) : submission.language ? (
                                                <span className="mt-1 block text-xs text-[#8a8a8a]">
                                                    {submission.language}
                                                </span>
                                            ) : null}
                                        </a>
                                    ))
                                )}
                            </div>
                        </article>
                    </section>
                )}

                {showLobbyModal && (
                    <CreateLobbyModal
                        username={user.leetcode_username ?? ""}
                        friends={friends}
                        onClose={() => setShowLobbyModal(false)}
                        onCreated={onOpenLobby}
                    />
                )}

                {showLinkModal && (
                    <LeetCodeLinkModal
                        onClose={() => setShowLinkModal(false)}
                        onChanged={handleLinkChanged}
                    />
                )}

                {dashboardData && (
                    <FriendsList
                        friends={friends}
                        onFriendRemoved={(friendshipId) =>
                            setFriends((currentFriends) =>
                                currentFriends.filter(
                                    (friend) => friend.friendship_id !== friendshipId,
                                ),
                            )
                        }
                        onError={setErrorMessage}
                    />
                )}

                {showOnboarding && (
                    <OnboardingOverlay onClose={() => setShowOnboarding(false)} />
                )}

                <Footer />
            </div>
        </main>
    );
}
