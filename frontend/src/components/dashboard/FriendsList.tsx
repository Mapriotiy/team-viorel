import { useState } from "react";
import { Trash2 } from "lucide-react";
import { apiRequest } from "../../api/client";
import type { CreateInviteResponse, FriendResponse } from "../../types/dashboard";
import { FriendFlame } from "./FriendFlame";

type FriendsListProps = {
    friends: FriendResponse[];
    onFriendRemoved: (friendshipId: number) => void;
    onError: (message: string | null) => void;
};

export function FriendsList({ friends, onFriendRemoved, onError }: FriendsListProps) {
    const [inviteUrl, setInviteUrl] = useState<string | null>(null);
    const [isCreatingInvite, setIsCreatingInvite] = useState(false);
    const [deletingFriendshipId, setDeletingFriendshipId] = useState<number | null>(null);
    const [copyMessage, setCopyMessage] = useState<string | null>(null);

    async function handleCreateInvite() {
        setIsCreatingInvite(true);
        onError(null);
        setCopyMessage(null);

        try {
            const result = await apiRequest<CreateInviteResponse>("/friends/invites", {
                method: "POST",
            });

            setInviteUrl(result.invite_url);
        } catch (error) {
            onError(
                error instanceof Error ? error.message : "Failed to create invite",
            );
        } finally {
            setIsCreatingInvite(false);
        }
    }

    async function handleCopyInvite() {
        if (!inviteUrl) {
            return;
        }

        await navigator.clipboard.writeText(inviteUrl);
        setCopyMessage("Invite link copied");
    }

    async function handleDeleteFriend(friendshipId: number, friendUsername: string) {
        const shouldDelete = window.confirm(
            `Remove ${friendUsername} and reset this friend streak?`,
        );

        if (!shouldDelete) {
            return;
        }

        setDeletingFriendshipId(friendshipId);
        onError(null);

        try {
            await apiRequest<void>(`/friends/${friendshipId}`, {
                method: "DELETE",
            });

            onFriendRemoved(friendshipId);
        } catch (error) {
            onError(
                error instanceof Error ? error.message : "Failed to remove friend",
            );
        } finally {
            setDeletingFriendshipId(null);
        }
    }

    return (
        <section className="mt-6 rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 shadow-xl shadow-black/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">Friend streaks</h2>
                    <p className="mt-2 text-sm text-[#a3a3a3]">
                        Create an invite link and send it to a friend.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleCreateInvite}
                    disabled={isCreatingInvite}
                    className="rounded-md bg-[#c86f3c] px-4 py-2 text-sm font-semibold text-[#111111] transition hover:bg-[#d9823f] disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-[#777777]"
                >
                    {isCreatingInvite ? "Creating..." : "Create invite link"}
                </button>
            </div>

            {inviteUrl ? (
                <div className="mt-4 rounded-lg border border-[#3a3a3a] bg-[#1f1f1f] p-3">
                    <p className="text-xs font-medium uppercase text-[#8a8a8a]">
                        Invite link
                    </p>

                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                            value={inviteUrl}
                            readOnly
                            className="min-w-0 flex-1 rounded-md border border-[#3a3a3a] bg-[#1a1a1a] px-3 py-2 text-sm text-white"
                        />

                        <button
                            type="button"
                            onClick={handleCopyInvite}
                            className="rounded-md border border-[#4a4a4a] bg-[#333333] px-4 py-2 text-sm font-medium text-[#d7d7d7] transition hover:bg-[#3d3d3d]"
                        >
                            Copy
                        </button>
                    </div>

                    {copyMessage ? (
                        <p className="mt-2 text-sm text-[#2cbb5d]">{copyMessage}</p>
                    ) : null}
                </div>
            ) : null}

            <div className="mt-6">
                <h3 className="text-sm font-semibold text-[#d7d7d7]">Friends</h3>

                {friends.length === 0 ? (
                    <p className="mt-2 text-sm text-[#8a8a8a]">No friends yet.</p>
                ) : (
                    <ul className="mt-3 grid gap-2">
                        {friends.map((item) => {
                            const statusText =
                                item.streak.state === "lit"
                                    ? "Both solved today"
                                    : item.streak.state === "pending"
                                      ? "Waiting for both of you today"
                                      : "Solve today to start a shared streak";

                            return (
                                <li
                                    key={item.friendship_id}
                                    className="flex items-center justify-between gap-4 rounded-md border border-[#3a3a3a] bg-[#1f1f1f] px-4 py-3 text-sm"
                                >
                                    <div className="flex items-center gap-4">
                                        <FriendFlame
                                            count={item.streak.display_count}
                                            state={item.streak.state}
                                            ignite={item.streak.state === "lit"}
                                        />

                                        <div>
                                            <p className="font-semibold text-[#eff1f6]">
                                                {item.friend.leetcode_username ?? `User #${item.friend.id}`}
                                            </p>
                                            <p className="mt-1 text-[#a3a3a3]">{statusText}</p>
                                            <p className="mt-1 text-xs text-[#8a8a8a]">
                                                Longest shared streak: {item.streak.longest_count} days
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleDeleteFriend(
                                                    item.friendship_id,
                                                    item.friend.leetcode_username ?? `user #${item.friend.id}`,
                                                )
                                            }
                                            disabled={deletingFriendshipId === item.friendship_id}
                                            className="grid h-9 w-9 place-items-center rounded-md border border-[#3a3a3a] bg-[#262626] text-[#8a8a8a] transition hover:border-red-500/60 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                            aria-label={`Remove ${item.friend.leetcode_username ?? `user #${item.friend.id}`}`}
                                            title={`Remove ${item.friend.leetcode_username ?? `user #${item.friend.id}`}`}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
}
