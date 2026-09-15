import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Flame, Link2, LogOut, UserCircle } from "lucide-react";
import { apiRequest } from "../api/client";
import { dashboardCacheKey, readCache, writeCache } from "../api/localCache";
import { ActivityCalendar } from "../components/dashboard/ActivityCalendar";
import { LeetCodeLinkModal } from "../components/LeetCodeLinkModal";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { Footer } from "../components/Footer";
import { Logo } from "../components/Logo";
import { OnboardingOverlay, isOnboarded } from "../components/OnboardingOverlay";
import { ProfilePage } from "./ProfilePage";
import type { DashboardData } from "../types/dashboard";

type User = {
    id: number;
    leetcode_username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    leetcode_verified_at: string | null;
};

type DashboardPageProps = {
    user: User;
    refreshKey: number;
    onLogout: () => void;
    onLinkChanged: () => void;
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

export function DashboardPage({ user, refreshKey, onLogout, onLinkChanged }: DashboardPageProps) {
    // Seed from the last-seen dashboard so returning to the menu paints instantly
    // instead of showing the "Loading dashboard..." placeholder (issue #1).
    const cachedDashboard = readCache<DashboardData>(
        dashboardCacheKey(user.id),
        DASHBOARD_CACHE_VERSION,
    );
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(
        cachedDashboard?.data ?? null,
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(() => !isOnboarded());
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
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
        <main className="min-h-screen bg-[#0f0d0b] p-4 text-[#eff1f6] sm:p-6">
            <header className="sticky top-0 z-20 -mx-4 -mt-4 mb-6 border-b border-[#2e2a26] bg-[#12100d]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <Logo className="text-[1.05rem] sm:text-[1.16rem]" />

                    <div className="flex items-center gap-3">
                        {isLeetcodeLinked ? (
                            <div className="hidden items-center gap-1.5 sm:flex">
                                <span
                                    className={`text-xs ${
                                        isCurrentStreakLit ? "text-[#e6a15d]" : "text-[#8f8278]"
                                    }`}
                                >
                                    {currentStreakHint}
                                </span>
                                <Flame
                                    size={16}
                                    className={
                                        isCurrentStreakLit
                                            ? "fill-[#e6a15d]/20 text-[#e6a15d]"
                                            : "text-[#8f8278]"
                                    }
                                />
                            </div>
                        ) : null}

                        <div className="relative" ref={profileMenuRef}>
                            <button
                                type="button"
                                onClick={() => setProfileMenuOpen((value) => !value)}
                                className="group flex min-w-0 items-center gap-2.5 rounded-md border border-[#3a342e] bg-[#211a16] px-2.5 py-1.5 text-left transition hover:bg-[#2a1f19] focus:outline-none focus:ring-2 focus:ring-[#e6a15d]/30"
                            >
                                <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-[#3a342e] bg-[#2a1f19] text-[#a8917d] transition group-hover:text-[#e6a15d]">
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
                                    <span className="block text-[11px] font-medium uppercase tracking-wide text-[#8f8278]">
                                        Profile
                                    </span>
                                    <span className="block truncate text-sm font-semibold text-[#f4e7d8]">
                                        {headerName}
                                    </span>
                                </span>
                                <ChevronDown
                                    size={16}
                                    className={`hidden shrink-0 text-[#8f8278] transition sm:block ${
                                        profileMenuOpen ? "rotate-180" : ""
                                    }`}
                                />
                            </button>

                            {profileMenuOpen ? (
                                <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-lg border border-[#3f332d] bg-[#1a1410] py-1 shadow-2xl shadow-black/40">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setProfileMenuOpen(false);
                                            setShowProfile(true);
                                        }}
                                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-[#d9c5ad] transition hover:bg-[#2a1f19]"
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
                                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-red-300 transition hover:bg-[#2a1f19]"
                                    >
                                        <LogOut size={15} />
                                        Logout
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-5xl">
                {showProfile && dashboardData ? (
                    <ProfilePage user={user} data={dashboardData} onBack={() => setShowProfile(false)} />
                ) : null}
                <div className={showProfile ? "hidden" : ""}>
                {!isLeetcodeLinked ? (
                    <section className="mt-6 rounded-lg border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/20">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-[#f4e7d8]">Link LeetCode to start tracking solves</h2>
                                <p className="mt-1 text-sm text-[#a8917d]">
                                    Verify ownership of your LeetCode account with an Accepted Two Sum submission.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowLinkModal(true)}
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[#e6a15d] px-4 py-2.5 text-sm font-semibold text-[#1d120c] transition hover:bg-[#d87a38]"
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
                        <article className="flex flex-col rounded-lg border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/20 transition hover:border-[#e6a15d]/40">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-[#a8917d]">Streak</p>
                                    <p className="mt-1 text-xs text-[#8f8278]">
                                        {currentStreakHint}
                                    </p>
                                </div>
                                <span className="rounded-full bg-[#2a1f19] px-2.5 py-1 text-xs font-semibold text-[#e6a15d]">
                                    <AnimatedNumber value={dashboardData?.current_streak ?? 0} />
                                </span>
                            </div>

                            <div className="mt-4 flex flex-col gap-2">
                                <div className="rounded-md border border-[#3f332d] bg-[#1a1410] px-3 py-2">
                                    <p className="text-xs text-[#8f8278]">Longest streak</p>
                                    <p className="mt-1 flex items-baseline gap-1.5 text-[#f4e7d8]">
                                        <AnimatedNumber value={dashboardData?.longest_streak ?? 0} />
                                        <span className="text-xs text-[#8f8278]">
                                            {dashboardData?.longest_streak === 1 ? "day" : "days"}
                                        </span>
                                    </p>
                                </div>
                                <div className="rounded-md border border-[#3f332d] bg-[#1a1410] px-3 py-2">
                                    <p className="text-xs text-[#8f8278]">Active days</p>
                                    <p className="mt-1 text-[#f4e7d8]">
                                        <AnimatedNumber value={dashboardData?.active_days_count ?? 0} />
                                    </p>
                                </div>
                                <div className="rounded-md border border-[#3f332d] bg-[#1a1410] px-3 py-2">
                                    <p className="text-xs text-[#8f8278]">Status</p>
                                    <p className={`mt-1 text-sm font-medium ${isCurrentStreakLit ? "text-[#e6a15d]" : "text-[#a8917d]"}`}>
                                        {dashboardData?.today_active ? "Active today" : "No solves yet today"}
                                    </p>
                                </div>
                            </div>
                        </article>

                        <ActivityCalendar
                            activityCalendar={dashboardData?.activity_calendar ?? []}
                            activeDaysCount={dashboardData?.active_days_count ?? 0}
                        />

                        <article className="flex flex-col rounded-lg border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/20 transition hover:border-[#e6a15d]/40">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-[#a8917d]">
                                        Today's solved
                                    </p>
                                    <p className="mt-1 text-xs text-[#8f8278]">
                                        Unique accepted problems
                                    </p>
                                </div>

                                <span className="rounded-full bg-[#2a1f19] px-2.5 py-1 text-xs font-semibold text-[#e6a15d]">
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
                                        <p className="text-sm text-[#8f8278]">
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
                                            className="block rounded-md border border-[#3f332d] px-3 py-2 text-sm text-[#f4e7d8] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d]"
                                        >
                                            <span className="block truncate font-medium">
                                                {submission.title}
                                            </span>
                                            {submission.language ? (
                                                <span className="mt-1 block text-xs text-[#8f8278]">
                                                    {LANGUAGE_LABELS[submission.language] ?? submission.language}
                                                </span>
                                            ) : null}
                                        </a>
                                    ))
                                )}
                            </div>
                        </article>
                    </section>
                )}

                {showLinkModal && (
                    <LeetCodeLinkModal
                        onClose={() => setShowLinkModal(false)}
                        onChanged={handleLinkChanged}
                    />
                )}

                {showOnboarding && (
                    <OnboardingOverlay onClose={() => setShowOnboarding(false)} />
                )}

                </div>
                <Footer />
            </div>
        </main>
    );
}
