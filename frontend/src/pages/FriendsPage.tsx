import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Search, Trash2, UserPlus, X } from "lucide-react";
import { apiRequest } from "../api/client";
import type { FriendResponse } from "../types/dashboard";

type FriendRequest = {
    id: number;
    requester: { id: number; leetcode_username: string | null };
    recipient: { id: number; leetcode_username: string | null };
    status: "pending" | "accepted" | "declined" | "cancelled";
    created_at: string;
};

type SearchUser = {
    id: number;
    leetcode_username: string | null;
    display_name: string | null;
    relation: "none" | "friend" | "incoming" | "outgoing";
    request_id: number | null;
};

function userName(user: { leetcode_username: string | null; id: number }) {
    return user.leetcode_username ?? `user #${user.id}`;
}

export function FriendsPage({ currentUserId, onBack }: { currentUserId: number; onBack: () => void }) {
    const [friends, setFriends] = useState<FriendResponse[]>([]);
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchUser[]>([]);
    const [searching, setSearching] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedFriendId, setSelectedFriendId] = useState<number | null>(null);

    const refresh = async () => {
        try {
            const [nextFriends, nextRequests] = await Promise.all([
                apiRequest<FriendResponse[]>("/friends/"),
                apiRequest<FriendRequest[]>("/friends/requests"),
            ]);
            setFriends(nextFriends);
            setRequests(nextRequests);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Failed to load friends");
        }
    };

    useEffect(() => {
        void refresh();
    }, []);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 3) {
            setResults([]);
            setSearching(false);
            return;
        }
        const timer = window.setTimeout(() => {
            setSearching(true);
            void apiRequest<SearchUser[]>(`/friends/search?q=${encodeURIComponent(trimmed)}`)
                .then(setResults)
                .catch((reason) => setError(reason instanceof Error ? reason.message : "Search failed"))
                .finally(() => setSearching(false));
        }, 350);
        return () => window.clearTimeout(timer);
    }, [query]);

    const incoming = useMemo(() => requests.filter((request) => request.recipient.id === currentUserId), [requests, currentUserId]);
    const outgoing = useMemo(() => requests.filter((request) => request.requester.id === currentUserId), [requests, currentUserId]);

    const sendRequest = async (userId: number) => {
        setBusyId(userId);
        setError(null);
        try {
            await apiRequest(`/friends/requests/${userId}`, { method: "POST" });
            setResults((current) => current.map((user) => user.id === userId ? { ...user, relation: "outgoing" } : user));
            await refresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Failed to send request");
        } finally {
            setBusyId(null);
        }
    };

    const respond = async (requestId: number, action: "accept" | "decline") => {
        setBusyId(requestId);
        setError(null);
        try {
            await apiRequest(`/friends/requests/${requestId}/${action}`, { method: "POST" });
            await refresh();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Failed to update request");
        } finally {
            setBusyId(null);
        }
    };

    const createInvite = async () => {
        try {
            const result = await apiRequest<{ invite_url: string }>("/friends/invites", { method: "POST" });
            setInviteUrl(result.invite_url);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Failed to create invite");
        }
    };

    const removeFriend = async (friendshipId: number) => {
        setBusyId(friendshipId);
        setError(null);
        try {
            await apiRequest(`/friends/${friendshipId}`, { method: "DELETE" });
            setFriends((current) => current.filter((friend) => friend.friendship_id !== friendshipId));
            setSelectedFriendId(null);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Failed to remove friend");
        } finally {
            setBusyId(null);
        }
    };

    const selectedFriend = friends.find((friend) => friend.friendship_id === selectedFriendId) ?? null;

    return (
        <main className="min-h-[100dvh] bg-[#14110f] text-[#f4e7d8]">
            <div className="mx-auto max-w-6xl px-4 py-5 sm:px-7 sm:py-8">
                <header className="flex items-center justify-between border-b border-[#332b25] pb-5">
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={onBack} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-md border border-[#3f332d] text-[#a8917d] hover:border-[#d9b887] hover:text-[#f4e7d8]"><ArrowLeft size={17} /></button>
                        <h1 className="text-2xl font-semibold">Friends</h1>
                    </div>
                </header>

                <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
                    <div className="rounded-xl border border-[#332b25] p-5">
                        <div className="flex items-center gap-3"><Search size={18} className="text-[#d9b887]" /><h2 className="font-semibold">Find people</h2></div>
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search LeetCode username" className="mt-4 h-11 w-full rounded-md border border-[#3f332d] bg-transparent px-3 text-sm text-[#f4e7d8] outline-none placeholder:text-[#756354] focus:border-[#d9b887]" />
                        {searching ? <p className="mt-3 text-sm text-[#8f8278]">Searching…</p> : null}
                        {results.length > 0 ? <div className="mt-3 divide-y divide-[#332b25]">{results.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{user.leetcode_username ?? user.display_name ?? `user #${user.id}`}</p><p className="mt-1 text-xs text-[#8f8278]">#{user.id}</p></div>{user.relation === "none" ? <button type="button" disabled={busyId === user.id} onClick={() => void sendRequest(user.id)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d9b887] px-3 text-xs font-semibold text-[#d9b887] disabled:opacity-50"><UserPlus size={14} /> Add</button> : <span className="text-xs text-[#8f8278]">{user.relation === "friend" ? "Friends" : user.relation === "incoming" ? "Incoming request" : "Pending"}</span>}</div>)}</div> : query.trim().length >= 3 && !searching ? <p className="mt-3 text-sm text-[#8f8278]">No users found.</p> : null}
                    </div>
                    <aside className="rounded-xl border border-[#332b25] p-5"><h2 className="font-semibold">Invite by link</h2><p className="mt-2 text-sm leading-5 text-[#8f8278]">Use a link when you already know who you want to invite.</p><button type="button" onClick={() => void createInvite()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#4c4238] text-sm font-semibold text-[#d9b887] hover:border-[#d9b887]"><Copy size={15} /> Create link</button>{inviteUrl ? <button type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl)} className="mt-3 w-full truncate rounded-md bg-[#1b1512] px-3 py-2 text-left text-xs text-[#a8917d]">{inviteUrl}</button> : null}</aside>
                </section>

                <section className="mt-8 grid gap-8 lg:grid-cols-2">
                    <div><h2 className="text-lg font-semibold">Your friends <span className="ml-2 text-sm font-normal text-[#8f8278]">{friends.length}</span></h2><div className="mt-3 space-y-2">{friends.length > 0 ? friends.map((friend) => <div key={friend.friendship_id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition ${selectedFriendId === friend.friendship_id ? "border-[#d9b887] bg-[#2b211c]" : "border-[#332b25] bg-[#1b1512]"}`}><button type="button" onClick={() => setSelectedFriendId(friend.friendship_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#5b9ae0] text-sm font-bold text-[#111]">{userName(friend.friend).slice(0, 1).toUpperCase()}</span><span className="min-w-0"><strong className="block truncate font-medium">{userName(friend.friend)}</strong><span className="mt-1 block text-xs text-[#8f8278]">{friend.streak.current_count} day streak · {friend.streak.state}</span></span></button><div className="flex shrink-0 items-center gap-1"><button type="button" title="View profile" onClick={() => setSelectedFriendId(friend.friendship_id)} className="grid h-8 w-8 place-items-center rounded-md text-[#a8917d] hover:bg-[#33271f] hover:text-[#f4e7d8]"><ExternalLink size={15} /></button><button type="button" title="Remove friend" disabled={busyId === friend.friendship_id} onClick={() => void removeFriend(friend.friendship_id)} className="grid h-8 w-8 place-items-center rounded-md text-[#8f8278] hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"><Trash2 size={15} /></button></div></div>) : <p className="py-4 text-sm text-[#8f8278]">No friends yet.</p>}</div>{selectedFriend ? <div className="mt-4 rounded-xl border border-[#4c4238] bg-[#211a16] p-4"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-[#5b9ae0] text-lg font-bold text-[#111]">{userName(selectedFriend.friend).slice(0, 1).toUpperCase()}</span><div><h3 className="font-semibold">{userName(selectedFriend.friend)}</h3><p className="mt-1 text-xs text-[#8f8278]">Friend since {selectedFriend.streak.started_at}</p></div></div><button type="button" onClick={() => setSelectedFriendId(null)} className="text-[#8f8278] hover:text-[#f4e7d8]"><X size={16} /></button></div><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-lg bg-[#1b1512] p-3"><strong className="block text-lg">{selectedFriend.streak.current_count}</strong><span className="text-xs text-[#8f8278]">current streak</span></div><div className="rounded-lg bg-[#1b1512] p-3"><strong className="block text-lg">{selectedFriend.streak.longest_count}</strong><span className="text-xs text-[#8f8278]">longest streak</span></div></div>{selectedFriend.friend.leetcode_username ? <a href={`https://leetcode.com/u/${encodeURIComponent(selectedFriend.friend.leetcode_username)}/`} target="_blank" rel="noreferrer" className="mt-4 flex h-9 items-center justify-center gap-2 rounded-md border border-[#4c4238] text-xs font-semibold text-[#d9b887] hover:border-[#d9b887]"><ExternalLink size={14} /> Open LeetCode profile</a> : null}<button type="button" onClick={() => void removeFriend(selectedFriend.friendship_id)} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md text-xs text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Remove friend</button></div> : null}</div>
                    <div><h2 className="text-lg font-semibold">Requests</h2><div className="mt-3 divide-y divide-[#332b25]">{incoming.map((request) => <div key={request.id} className="flex items-center justify-between gap-3 py-3"><p className="font-medium">{userName(request.requester)}</p><div className="flex gap-2"><button type="button" disabled={busyId === request.id} onClick={() => void respond(request.id, "accept")} className="grid h-8 w-8 place-items-center rounded-md border border-[#7fbf8e] text-[#7fbf8e] disabled:opacity-50"><Check size={15} /></button><button type="button" disabled={busyId === request.id} onClick={() => void respond(request.id, "decline")} className="grid h-8 w-8 place-items-center rounded-md border border-[#8f8278] text-[#8f8278] disabled:opacity-50"><X size={15} /></button></div></div>)}{outgoing.map((request) => <div key={request.id} className="flex items-center justify-between py-3 text-sm"><span>{userName(request.recipient)}</span><span className="text-xs text-[#8f8278]">Pending</span></div>)}{incoming.length === 0 && outgoing.length === 0 ? <p className="py-4 text-sm text-[#8f8278]">No pending requests.</p> : null}</div></div>
                </section>
                {error ? <p className="mt-6 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p> : null}
            </div>
        </main>
    );
}
