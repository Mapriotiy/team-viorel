import { useCallback, useEffect, useState } from "react";
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    Crown,
    Flame,
    Gamepad2,
    LogOut,
    MapPin,
    Trophy,
    UserCircle,
} from "lucide-react";
import { apiRequest } from "../api/client";
import { ActivityCalendar } from "../components/dashboard/ActivityCalendar";
import { Footer } from "../components/Footer";
import type { DashboardData } from "../types/dashboard";

type ProfilePageProps = {
    onBack: () => void;
    onLogout: () => void;
};

function StreakPill({ count, lit }: { count: number; lit: boolean }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${
                lit
                    ? "border-[#e6a15d]/50 bg-[#e6a15d]/10 text-[#e8b691]"
                    : "border-[#3f332d] bg-[#1b1512] text-[#8f8278]"
            }`}
        >
            <Flame size={15} className={lit ? "text-[#e6a15d]" : "text-[#555]"} />
            {count} day{count === 1 ? "" : "s"}
        </span>
    );
}

function StatTile({
    icon,
    label,
    value,
    accent,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    accent?: string;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl border border-[#3f332d] bg-[#211a16] px-4 py-3.5 shadow-xl shadow-black/20">
            <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border"
                style={{
                    borderColor: (accent ?? "#3f332d") + "55",
                    backgroundColor: (accent ?? "#333") + "1f",
                    color: accent ?? "#a8917d",
                }}
            >
                {icon}
            </span>
            <div className="min-w-0">
                <p className="text-xs text-[#8f8278]">{label}</p>
                <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: accent ?? "#f4e7d8" }}>
                    {value}
                </p>
            </div>
        </div>
    );
}

export function ProfilePage({ onBack, onLogout }: ProfilePageProps) {
    const [data, setData] = useState<DashboardData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setData(await apiRequest<DashboardData>("/dashboard/"));
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load profile");
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const stats = data?.stats;
    const winRate = stats?.win_rate ?? 0;
    const streakLit = data?.current_streak_state === "lit";

    return (
        <main className="min-h-screen bg-transparent p-4 text-white sm:p-6">
            <div className="mx-auto max-w-5xl">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={onBack}
                            className="grid h-10 w-10 place-items-center rounded-md border border-[#3f332d] bg-[#211a16] text-[#a8917d] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d]"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
                            <p className="mt-1 text-sm text-[#8f8278]">Your progress at a glance</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#3f332d] bg-[#211a16] px-4 text-sm font-medium text-[#d9c5ad] transition hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200"
                    >
                        <LogOut size={16} />
                        Logout
                    </button>
                </header>

                {error ? (
                    <p className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {error}
                    </p>
                ) : null}

                <section className="relative mt-6 overflow-hidden rounded-2xl border border-[#3f332d] bg-gradient-to-br from-[#24201c] to-[#1b1512] p-6 shadow-2xl shadow-black/30">
                    <div
                        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-25"
                        style={{ background: "radial-gradient(circle, #e6a15d 0%, transparent 70%)" }}
                    />
                    <div className="relative flex flex-col items-center gap-4 sm:flex-row">
                        <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#e6a15d]/40 bg-[#24201c] text-[#a8917d] shadow-lg">
                            {data?.avatar_url ? (
                                <img src={data.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <UserCircle size={48} strokeWidth={1.6} />
                            )}
                        </span>
                        <div className="min-w-0 flex-1 text-center sm:text-left">
                            <p className="truncate text-2xl font-bold text-[#f4e7d8]">
                                {data?.display_name ?? "—"}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                                {data?.leetcode_username ? (
                                    <span className="rounded-full border border-[#e6a15d]/40 bg-[#e6a15d]/10 px-2.5 py-0.5 text-sm font-semibold text-[#e8b691]">
                                        @{data.leetcode_username}
                                    </span>
                                ) : (
                                    <span className="text-sm text-[#8f8278]">LeetCode account not linked</span>
                                )}
                                <StreakPill count={data?.current_streak ?? 0} lit={streakLit} />
                            </div>
                            <p className="mt-2 text-xs text-[#8f8278]">
                                {data?.active_days_count ?? 0} active days on the calendar
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatTile icon={<Trophy size={18} />} label="Longest streak" value={data?.longest_streak ?? 0} accent="#e8b691" />
                    <StatTile icon={<CalendarDays size={18} />} label="Active days" value={data?.active_days_count ?? 0} />
                    <StatTile icon={<CheckCircle2 size={18} />} label="Solved today" value={data?.today_submissions.length ?? 0} accent="#7fe8ff" />
                    <StatTile icon={<Gamepad2 size={18} />} label="Games played" value={stats?.games_played ?? 0} />
                </section>

                <section className="mt-4 rounded-2xl border border-[#3f332d] bg-[#211a16] p-5 shadow-xl shadow-black/20">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Crown size={18} className="text-[#2bff88]" />
                            <h2 className="text-sm font-semibold text-[#f4e7d8]">Match record</h2>
                        </div>
                        <span className="text-lg font-bold tabular-nums text-[#2bff88]">{winRate}%</span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#24201c]">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-[#27d980] to-[#2bff88] transition-all duration-700"
                            style={{ width: `${Math.min(100, winRate)}%` }}
                        />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2 text-[#a8917d]">
                            <Gamepad2 size={15} className="text-[#8f8278]" />
                            <span>
                                {stats?.games_played ?? 0} games ·{" "}
                                <span className="font-semibold text-[#7ef7bb]">{stats?.games_won ?? 0} wins</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-[#a8917d]">
                            <MapPin size={15} className="text-[#7fe8ff]" />
                            <span>
                                <span className="font-semibold text-[#7fe8ff]">{stats?.total_captures ?? 0}</span>{" "}
                                provinces captured
                            </span>
                        </div>
                    </div>
                </section>

                <section className="mt-4">
                    <ActivityCalendar
                        activityCalendar={data?.activity_calendar ?? []}
                        activeDaysCount={data?.active_days_count ?? 0}
                    />
                </section>

                <Footer />
            </div>
        </main>
    );
}
