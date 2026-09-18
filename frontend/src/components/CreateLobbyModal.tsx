import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { apiRequest } from '../api/client';
import { useToast } from './toast/ToastProvider';

type Friend = {
    friendship_id: number;
    friend: { id: number; leetcode_username: string | null };
};

type CreateLobbyModalProps = {
    username: string;
    friends: Friend[];
    onClose: () => void;
    onCreated: (lobbyId: number) => void;
};

// Tile backgrounds live in public/modes/ (see the README there for the art spec).
// A missing file just leaves the tile on its flat background, so shipping the
// artwork later needs no code change.
const GAME_MODES = [
    { value: 'free_for_all', label: 'Free for All', image: 'modes/free-for-all.webp' },
    { value: 'team_battle', label: 'Team Battle', image: 'modes/team-battle.webp' },
    { value: 'bingo', label: 'Bingo', image: 'modes/bingo.webp' },
];

// Lobbies fill up to this many players; the creator starts with whoever joined.
const MAX_LOBBY_PLAYERS = 4;

const PROGRAMMING_LANGUAGES = [
    { value: 'python3', label: 'Python 3' },
    { value: 'cpp', label: 'C++' },
    { value: 'java', label: 'Java' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'csharp', label: 'C#' },
    { value: 'golang', label: 'Go' },
    { value: 'rust', label: 'Rust' },
];

export function CreateLobbyModal({ username, friends, onClose, onCreated }: CreateLobbyModalProps) {
    const { push } = useToast();
    const [name, setName] = useState(`${username}'s game`);
    const [gameMode, setGameMode] = useState('free_for_all');
    const [programmingLanguage, setProgrammingLanguage] = useState('python3');
    const [factionMode, setFactionMode] = useState(false);
    const [factionCount, setFactionCount] = useState(2);
    const [selectedFriends, setSelectedFriends] = useState<Set<number>>(new Set());
    const [friendSearch, setFriendSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedFriendRows = useMemo(
        () => friends.filter((friend) => selectedFriends.has(friend.friend.id)),
        [friends, selectedFriends],
    );

    const filteredFriends = useMemo(() => {
        const query = friendSearch.trim().toLowerCase();
        if (!query) return friends;
        return friends.filter((friend) =>
            (friend.friend.leetcode_username ?? '').toLowerCase().includes(query),
        );
    }, [friends, friendSearch]);

    const toggleFriend = (id: number) => {
        setSelectedFriends((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleCreate = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiRequest<{ lobby: { id: number }; invite_url: string }>('/lobbies', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    game_mode: gameMode,
                    map_size: 'medium',
                    programming_language: programmingLanguage,
                    max_players: factionMode ? 0 : MAX_LOBBY_PLAYERS,
                    faction_mode: factionMode,
                    faction_count: factionMode ? factionCount : 0,
                    // Bingo's win condition is implicit: first line, else majority.
                    win_condition: gameMode === 'bingo'
                        ? {}
                        : { type: 'points', threshold: 5000, duration_hours: 0 },
                }),
            });

            for (const fid of selectedFriends) {
                await apiRequest(`/lobbies/${res.lobby.id}/invite-user`, {
                    method: 'POST',
                    body: JSON.stringify({ user_id: fid }),
                }).catch(() => {});
            }

            sessionStorage.setItem(`lobby_invite_${res.lobby.id}`, res.invite_url);
            push('success', 'Lobby created');
            onCreated(res.lobby.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create lobby');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-lg border border-[#3f332d] bg-[#211a16] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-5 flex shrink-0 items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Create Lobby</h2>
                    <button onClick={onClose} className="text-[#8f8278] hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
                    <div>
                        <label className="text-xs font-medium text-[#8f8278] block mb-1">Lobby Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full rounded-md border border-[#3f332d] bg-[#191410] px-3 py-2 text-sm text-white"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-[#8f8278] block mb-1">Game Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                            {GAME_MODES.map((m) => (
                                <button
                                    key={m.value}
                                    type="button"
                                    onClick={() => {
                                        setGameMode(m.value);
                                        setFactionMode(m.value === 'team_battle');
                                    }}
                                    className={`relative aspect-square overflow-hidden rounded-md border transition ${
                                        gameMode === m.value
                                            ? 'border-[#e6a15d] bg-[#e6a15d]/10 text-[#e6a15d]'
                                            : 'border-[#3f332d] bg-[#1b1512] text-[#f4e7d8] hover:border-white/30'
                                    }`}
                                >
                                    {m.image && (
                                        <>
                                            <span
                                                className="absolute inset-0 bg-cover bg-center"
                                                style={{ backgroundImage: `url(${import.meta.env.BASE_URL}${m.image})` }}
                                            />
                                            {/* Matte holds the art back so the form stays the focus;
                                                the selected tile lifts to mark itself. */}
                                            <span
                                                className={`absolute inset-0 transition ${
                                                    gameMode === m.value ? 'bg-black/30' : 'bg-black/65'
                                                }`}
                                            />
                                        </>
                                    )}
                                    {/* Scrim keeps the label readable once artwork lands. */}
                                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 text-center text-sm font-medium">
                                        {m.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-medium text-[#8f8278] block mb-1">Language</label>
                        <select
                            value={programmingLanguage}
                            onChange={(event) => setProgrammingLanguage(event.currentTarget.value)}
                            className="w-full rounded-md border border-[#3f332d] bg-[#191410] px-3 py-2 text-sm text-white outline-none focus:border-[#e6a15d]/70"
                        >
                            {PROGRAMMING_LANGUAGES.map((language) => (
                                <option key={language.value} value={language.value}>
                                    {language.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {factionMode && (
                        <div>
                            <label className="text-xs font-medium text-[#8f8278] block mb-1">Factions</label>
                            <div className="flex gap-1.5">
                                {[2, 3, 4].map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setFactionCount(n)}
                                        className={`flex-1 rounded-md border py-2 text-sm font-medium transition ${
                                            factionCount === n
                                                ? 'border-[#e6a15d] bg-[#e6a15d]/10 text-[#e6a15d]'
                                                : 'border-[#3f332d] bg-[#1b1512] text-[#f4e7d8] hover:border-white/30'
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {friends.length > 0 && (
                        <div className="rounded-md border border-[#3f332d] bg-[#1b1512] p-3">
                            <div className="flex items-center justify-between gap-3">
                                <label className="text-xs font-medium text-[#8f8278]">
                                    Invite Friends
                                </label>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-[#333] px-2 py-0.5 text-xs font-semibold text-[#e6a15d]">
                                        {selectedFriends.size} selected
                                    </span>
                                    {selectedFriends.size > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFriends(new Set())}
                                            className="text-xs font-medium text-[#8f8278] transition hover:text-red-300"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="relative mt-2">
                                <Search
                                    size={15}
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8f8278]"
                                />
                                <input
                                    value={friendSearch}
                                    onChange={(event) => setFriendSearch(event.target.value)}
                                    placeholder="Search friends"
                                    className="w-full rounded-md border border-[#3f332d] bg-[#191410] py-2 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-[#8f8278] focus:border-[#e6a15d]/70"
                                />
                            </div>

                            {selectedFriendRows.length > 0 && (
                                <div className="mt-2 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto pr-1">
                                    {selectedFriendRows.map((friend) => (
                                        <button
                                            key={friend.friendship_id}
                                            type="button"
                                            onClick={() => toggleFriend(friend.friend.id)}
                                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#e6a15d]/50 bg-[#e6a15d]/10 px-2 py-1 text-xs font-medium text-[#e8b691] transition hover:border-red-300/60 hover:text-red-200"
                                        >
                                            <span className="truncate">
                                                {friend.friend.leetcode_username ?? `User #${friend.friend.id}`}
                                            </span>
                                            <X size={12} />
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-[#333] bg-[#191410]">
                                {filteredFriends.length === 0 ? (
                                    <p className="px-3 py-3 text-sm text-[#8f8278]">No friends found</p>
                                ) : (
                                    filteredFriends.map((friend) => {
                                        const isSelected = selectedFriends.has(friend.friend.id);
                                        return (
                                            <button
                                                key={friend.friendship_id}
                                                type="button"
                                                onClick={() => toggleFriend(friend.friend.id)}
                                                className="flex w-full items-center gap-3 border-b border-[#2d2d2d] px-3 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-[#252525]"
                                            >
                                                <span
                                                    className={`grid h-5 w-5 shrink-0 place-items-center rounded border transition ${
                                                        isSelected
                                                            ? 'border-[#e6a15d] bg-[#e6a15d] text-[#111]'
                                                            : 'border-[#4c3a31] bg-[#1b1512] text-transparent'
                                                    }`}
                                                >
                                                    <Check size={13} strokeWidth={3} />
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[#f4e7d8]">
                                                    {friend.friend.leetcode_username ?? `User #${friend.friend.id}`}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-400">{error}</p>}
                </div>

                <button
                    type="button"
                    onClick={handleCreate}
                    disabled={loading || !name.trim()}
                    className="mt-5 w-full shrink-0 rounded-md bg-[#e6a15d] py-2.5 text-sm font-semibold text-[#111] transition hover:bg-[#d87a38] disabled:cursor-not-allowed disabled:bg-[#3f332d] disabled:text-[#8f8278]"
                >
                    {loading ? 'Creating...' : 'Create Lobby'}
                </button>
            </div>
        </div>
    );
}
