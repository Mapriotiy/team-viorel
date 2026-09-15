import { ArrowLeft, CalendarDays, Flame, LockKeyhole, Trophy, UserCircle } from "lucide-react";
import { useState } from "react";
import { AnimatedNumber } from "../components/AnimatedNumber";
import { ActivityCalendar } from "../components/dashboard/ActivityCalendar";
import type { DashboardData } from "../types/dashboard";

type ProfileUser = {
    display_name: string | null;
    avatar_url: string | null;
    leetcode_username: string | null;
};

type ProfilePageProps = {
    user: ProfileUser;
    data: DashboardData;
    onBack: () => void;
};

export function ProfilePage({ user, data, onBack }: ProfilePageProps) {
    const [view, setView] = useState<"private" | "friend">("private");
    const name = data.display_name ?? user.display_name ?? "LeetCode player";

    return (
        <section className="mx-auto max-w-5xl">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 rounded-md border border-[#3f332d] px-3 py-2 text-sm text-[#d9c5ad] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d]"
                >
                    <ArrowLeft size={15} />
                    Back to dashboard
                </button>
                <div className="inline-flex rounded-md border border-[#3f332d] bg-[#211a16] p-1 text-xs">
                    <button
                        type="button"
                        onClick={() => setView("private")}
                        className={`rounded px-3 py-1.5 ${view === "private" ? "bg-[#e6a15d] font-semibold text-[#1d120c]" : "text-[#a8917d]"}`}
                    >
                        My profile
                    </button>
                    <button
                        type="button"
                        onClick={() => setView("friend")}
                        className={`rounded px-3 py-1.5 ${view === "friend" ? "bg-[#e6a15d] font-semibold text-[#1d120c]" : "text-[#a8917d]"}`}
                    >
                        Friend view
                    </button>
                </div>
            </div>

            {view === "friend" ? (
                <div className="rounded-lg border border-[#3f332d] bg-[#211a16] p-8 text-center shadow-xl shadow-black/20">
                    <LockKeyhole className="mx-auto text-[#e6a15d]" size={28} />
                    <h2 className="mt-3 text-lg font-semibold text-[#f4e7d8]">Friend view preview</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#a8917d]">
                        Friends will see your public streak and activity summary here. Private account details stay hidden.
                    </p>
                </div>
            ) : (
                <>
                    <header className="rounded-lg border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/20">
                        <div className="flex items-center gap-4">
                            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-[#3f332d] bg-[#2a1f19] text-[#a8917d]">
                                {data.avatar_url ?? user.avatar_url ? (
                                    <img src={data.avatar_url ?? user.avatar_url ?? ""} alt="" className="h-full w-full object-cover" />
                                ) : <UserCircle size={34} />}
                            </span>
                            <div>
                                <p className="text-xs uppercase tracking-[0.22em] text-[#8f8278]">Profile</p>
                                <h1 className="mt-1 text-2xl font-bold text-[#f4e7d8]">{name}</h1>
                                <p className="mt-1 text-sm text-[#a8917d]">@{data.leetcode_username ?? user.leetcode_username ?? "not linked"}</p>
                            </div>
                        </div>
                    </header>

                    <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <article className="rounded-lg border border-[#3f332d] bg-[#211a16] p-5">
                            <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#8f8278]"><Flame size={14} className="text-[#e6a15d]" />Current streak</p>
                            <p className="mt-3 text-4xl font-black text-[#f4e7d8]"><AnimatedNumber value={data.current_streak} /> <span className="text-sm font-normal text-[#8f8278]">days</span></p>
                        </article>
                        <article className="rounded-lg border border-[#3f332d] bg-[#211a16] p-5">
                            <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#8f8278]"><Trophy size={14} className="text-[#e6a15d]" />Longest streak</p>
                            <p className="mt-3 text-4xl font-black text-[#f4e7d8]"><AnimatedNumber value={data.longest_streak} /> <span className="text-sm font-normal text-[#8f8278]">days</span></p>
                        </article>
                        <article className="rounded-lg border border-[#3f332d] bg-[#211a16] p-5">
                            <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#8f8278]"><CalendarDays size={14} className="text-[#e6a15d]" />Active days</p>
                            <p className="mt-3 text-4xl font-black text-[#f4e7d8]"><AnimatedNumber value={data.active_days_count} /></p>
                        </article>
                    </div>
                    <div className="mt-4">
                        <ActivityCalendar activityCalendar={data.activity_calendar} activeDaysCount={data.active_days_count} />
                    </div>
                </>
            )}
        </section>
    );
}
