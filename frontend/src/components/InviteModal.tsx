import { useEffect, useState } from "react";
import { apiRequest } from "../api/client";

type User = {
    id: number;
    leetcode_username: string | null;
};

type InviteData = {
    token: string;
    status: string;
    inviter: {
        id: number;
        leetcode_username: string | null;
    };
    created_at: string;
};

type AcceptInviteResponse = {
    friendship_id: number;
    friend: {
        id: number;
        leetcode_username: string | null;
    };
};

type InviteModalProps = {
    token: string;
    user: User | null;
    onClose: () => void;
    onAccepted: () => void;
    onNeedAuth: () => void;
};

export function InviteModal({
    token,
    user,
    onClose,
    onAccepted,
    onNeedAuth,
}: InviteModalProps) {
    const [invite, setInvite] = useState<InviteData | null>(null);
    const [acceptedInvite, setAcceptedInvite] =
        useState<AcceptInviteResponse | null>(null);
    const [isLoadingInvite, setIsLoadingInvite] = useState(true);
    const [isAccepting, setIsAccepting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        async function loadInvite() {
            setIsLoadingInvite(true);
            setErrorMessage(null);
            setAcceptedInvite(null);

            try {
                const data = await apiRequest<InviteData>(`/friends/invites/${token}`);
                setInvite(data);
            } catch (error) {
                setErrorMessage(
                    error instanceof Error ? error.message : "Failed to load invite",
                );
            } finally {
                setIsLoadingInvite(false);
            }
        }

        void loadInvite();
    }, [token]);

    function handleNeedAuth() {
        localStorage.setItem("pendingInviteToken", token);
        onNeedAuth();
    }

    async function handleAcceptInvite() {
        if (!user) {
            handleNeedAuth();
            return;
        }

        setIsAccepting(true);
        setErrorMessage(null);

        try {
            const result = await apiRequest<AcceptInviteResponse>(
                `/friends/invites/${token}/accept`,
                {
                    method: "POST",
                },
            );

            localStorage.removeItem("pendingInviteToken");
            setAcceptedInvite(result);
            onAccepted();
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : "Failed to accept invite",
            );
        } finally {
            setIsAccepting(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <section className="w-full max-w-md rounded-lg border border-[#3a3a3a] bg-[#262626] p-6 text-white shadow-xl shadow-black/30">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-[#c86f3c]">
                            LeetCode Streaks invite
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                            {invite
                                ? `Join ${invite.inviter.leetcode_username ?? "your friend"}`
                                : "Friend invite"}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md border border-[#4a4a4a] bg-[#333333] px-3 py-1.5 text-sm text-[#d7d7d7] transition hover:bg-[#3d3d3d]"
                    >
                        Close
                    </button>
                </div>

                {isLoadingInvite ? (
                    <p className="mt-6 text-sm text-[#b3b3b3]">Loading invite...</p>
                ) : null}

                {!isLoadingInvite && errorMessage ? (
                    <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {errorMessage}
                    </div>
                ) : null}

                {!isLoadingInvite && invite && !acceptedInvite ? (
                    <>
                        <p className="mt-4 text-sm text-[#b3b3b3]">
                            Accept this invite to start tracking a shared LeetCode streak.
                        </p>

                        <div className="mt-6 rounded-md border border-[#3a3a3a] bg-[#1f1f1f] p-4">
                            <p className="text-sm text-[#8a8a8a]">Invite status</p>
                            <p className="mt-1 text-sm font-medium">{invite.status}</p>
                        </div>

                        {!user ? (
                            <p className="mt-4 text-sm text-[#b3b3b3]">
                                Login or create an account first. The invite will be saved
                                and reopened after authentication.
                            </p>
                        ) : null}

                        <button
                            type="button"
                            onClick={handleAcceptInvite}
                            disabled={isAccepting || invite.status !== "pending"}
                            className="mt-6 w-full rounded-md bg-[#c86f3c] px-4 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#d9823f] disabled:cursor-not-allowed disabled:bg-[#3a3a3a] disabled:text-[#777777]"
                        >
                            {isAccepting
                                ? "Accepting..."
                                : user
                                  ? "Accept invite"
                                  : "Continue to login"}
                        </button>
                    </>
                ) : null}

                {acceptedInvite ? (
                    <div className="mt-6 rounded-md border border-[#2cbb5d]/30 bg-[#2cbb5d]/10 px-4 py-3">
                        <p className="text-sm font-medium text-[#7ee39d]">
                            Invite accepted
                        </p>
                        <p className="mt-2 text-sm text-[#a7f3bd]">
                            You are now friends with{" "}
                            {acceptedInvite.friend.leetcode_username ?? `user #${acceptedInvite.friend.id}`}.
                        </p>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
