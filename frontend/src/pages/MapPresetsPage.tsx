import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";

type Preset = { id: string; name: string; description: string; width: number; height: number; preview_url: string | null };

export function MapPresetsPage({ onBack }: { onBack: () => void }) {
    const [presets, setPresets] = useState<Preset[]>([]);
    useEffect(() => { void apiRequest<Preset[]>("/map-presets").then(setPresets); }, []);
    return <main className="min-h-screen bg-[#0f0d0b] p-8 text-white"><button onClick={onBack} className="mb-6 text-orange-300">← Back</button><h1 className="mb-6 text-3xl font-bold">Map presets</h1><div className="grid gap-5 md:grid-cols-3">{presets.map(p => <article key={p.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5"><div className="grid h-40 place-items-center bg-gradient-to-br from-emerald-900/70 to-slate-900 text-4xl">⌘</div><div className="p-5"><h2 className="text-xl font-semibold">{p.name}</h2><p className="mt-2 text-sm text-white/60">{p.description}</p><p className="mt-3 text-xs uppercase tracking-wide text-orange-300">{p.width} × {p.height} board</p></div></article>)}</div></main>;
}
