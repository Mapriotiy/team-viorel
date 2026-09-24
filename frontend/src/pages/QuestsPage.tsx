import { useEffect, useState } from "react";
import { ArrowLeft, Check, Flame, Target } from "lucide-react";
import { apiRequest } from "../api/client";

type Quest = {
    key: string;
    title: string;
    description: string;
    period: "daily" | "weekly";
    progress: number;
    target: number;
    completed: boolean;
    reset_at: string;
};

type QuestsResponse = { daily: Quest[]; weekly: Quest[] };

function QuestCard({ quest }: { quest: Quest }) {
    const progress = Math.min(100, Math.round((quest.progress / Math.max(1, quest.target)) * 100));
    const reset = new Date(quest.reset_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return (
        <article className={`rounded-xl border p-4 ${quest.completed ? "border-[#7fbf8e]/50 bg-[#7fbf8e]/[0.06]" : "border-[#332b25] bg-[#1b1512]"}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="font-semibold text-[#f4e7d8]">{quest.title}</h3>
                    <p className="mt-1 text-sm text-[#8f8278]">{quest.description}</p>
                </div>
                {quest.completed ? <span className="grid h-8 w-8 place-items-center rounded-full bg-[#7fbf8e]/20 text-[#7fbf8e]"><Check size={16} /></span> : <span className="text-sm font-semibold text-[#d9b887]">{quest.progress}/{quest.target}</span>}
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#332b25]"><span className="block h-full rounded-full bg-[#d9b887] transition-all" style={{ width: `${progress}%` }} /></div>
            <p className="mt-3 text-xs text-[#756354]">{quest.completed ? "Completed" : `Resets ${reset}`}</p>
        </article>
    );
}

export function QuestsPage({ onBack }: { onBack: () => void }) {
    const [data, setData] = useState<QuestsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void apiRequest<QuestsResponse>("/quests")
            .then(setData)
            .catch((reason) => setError(reason instanceof Error ? reason.message : "Failed to load quests"));
    }, []);

    return (
        <main className="min-h-[100dvh] bg-[#14110f] text-[#f4e7d8]">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-7 sm:py-8">
                <header className="flex items-center gap-4 border-b border-[#332b25] pb-5"><button type="button" onClick={onBack} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-md border border-[#3f332d] text-[#a8917d] hover:border-[#d9b887] hover:text-[#f4e7d8]"><ArrowLeft size={17} /></button><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d9b887]">Progress</p><h1 className="mt-1 text-2xl font-semibold">Quests</h1></div></header>
                {error ? <p className="mt-6 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
                {!data && !error ? <p className="mt-8 text-sm text-[#8f8278]">Loading quests…</p> : null}
                {data ? <>
                    <section className="mt-8"><div className="flex items-center gap-3"><Flame size={19} className="text-[#d9b887]" /><h2 className="text-xl font-semibold">Daily</h2><span className="text-sm text-[#756354]">resets tomorrow</span></div><div className="mt-4 grid gap-3 md:grid-cols-3">{data.daily.map((quest) => <QuestCard key={quest.key} quest={quest} />)}</div></section>
                    <section className="mt-10"><div className="flex items-center gap-3"><Target size={19} className="text-[#d9b887]" /><h2 className="text-xl font-semibold">Weekly</h2><span className="text-sm text-[#756354]">resets Monday</span></div><div className="mt-4 grid gap-3 md:grid-cols-3">{data.weekly.map((quest) => <QuestCard key={quest.key} quest={quest} />)}</div></section>
                </> : null}
            </div>
        </main>
    );
}
