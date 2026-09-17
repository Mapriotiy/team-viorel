import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";

type Lobby = { id: number; name: string; owner_id: number; capacity: number; status: string; player_count: number; players: { user_id: number; display_name: string }[]; created_at: string };

export function LobbyPage({ onBack }: { onBack: () => void }) {
    const [lobbies, setLobbies] = useState<Lobby[]>([]);
    const [name, setName] = useState("");
    const [capacity, setCapacity] = useState(4);
    const [error, setError] = useState<string | null>(null);
    const load = () => apiRequest<Lobby[]>("/lobbies").then(setLobbies).catch((e) => setError(e.message));
    useEffect(() => { void load(); }, []);
    async function create() {
        try { await apiRequest("/lobbies", { method: "POST", body: JSON.stringify({ name, capacity }) }); setName(""); await load(); }
        catch (e) { setError(e instanceof Error ? e.message : "Could not create lobby"); }
    }
    async function join(id: number) { try { await apiRequest(`/lobbies/${id}/join`, { method: "POST" }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not join lobby"); } }
    return <main className="min-h-screen bg-[#0f0d0b] p-8 text-white"><button onClick={onBack} className="mb-6 text-orange-300">← Back</button><h1 className="mb-6 text-3xl font-bold">Game lobbies</h1>
        <section className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5"><h2 className="mb-3 text-xl">Create lobby</h2><div className="flex flex-wrap gap-3"><input value={name} onChange={e => setName(e.target.value)} placeholder="Lobby name" className="rounded bg-black/30 px-3 py-2"/><select value={capacity} onChange={e => setCapacity(Number(e.target.value))} className="rounded bg-black/30 px-3 py-2"><option value={2}>2 players</option><option value={4}>4 players</option><option value={8}>8 players</option></select><button disabled={!name.trim()} onClick={create} className="rounded bg-orange-500 px-4 py-2 font-semibold disabled:opacity-40">Create</button></div></section>
        {error && <p className="mb-4 text-red-300">{error}</p>}<div className="grid gap-4 md:grid-cols-2">{lobbies.map(lobby => <article key={lobby.id} className="rounded-2xl border border-white/10 bg-white/5 p-5"><div className="flex justify-between"><h2 className="text-xl font-semibold">{lobby.name}</h2><span className="text-sm text-white/60">{lobby.player_count}/{lobby.capacity}</span></div><p className="mt-2 text-sm text-white/60">{lobby.status === "open" ? "Open for players" : "Closed"}</p><button onClick={() => join(lobby.id)} disabled={lobby.player_count >= lobby.capacity || lobby.status !== "open"} className="mt-4 rounded bg-white/10 px-4 py-2 disabled:opacity-40">Join lobby</button></article>)}</div>
    </main>;
}
