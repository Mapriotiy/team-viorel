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

type InvitePageProps = {
    token: string;
    user: User | null;
    onAccepted: () => void;
    onNeedAuth: () => void;
};

export function InvitePage({
                               token,
                               user,
                               onAccepted,
                               onNeedAuth,
                           }: InvitePageProps) {
    const [invite, setInvite] = useState<InviteData | null>(null);
    const [acceptedInvite, setAcceptedInvite] =
        useState<AcceptInviteResponse | null>(null);
    const [isLoadingInvite, setIsLoadingInvite] = useState(true);
    const [isAccepting, setIsAccepting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        async function loadInvite() {
            setErrorMessage(null);

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

    async function handleAcceptInvite() {
        if (!user) {
            localStorage.setItem("pendingInviteToken", token);
            onNeedAuth();
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
        <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
            <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center">
                <section className="w-full rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    {isLoadingInvite ? (
                        <p className="text-sm text-slate-600">Loading invite...</p>
                    ) : null}

                    {!isLoadingInvite && errorMessage ? (
                        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {errorMessage}
                        </div>
                    ) : null}

                    {!isLoadingInvite && invite && !acceptedInvite ? (
                        <>
                            <p className="text-sm font-medium text-orange-600">
                                LeetCode Streaks invite
                            </p>

                            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                                Join {invite.inviter.leetcode_username ?? "your friend"}
                            </h1>

                            <p className="mt-3 text-sm text-slate-600">
                                Accept this invite to start tracking a shared LeetCode streak.
                            </p>

                            <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">Invite status</p>
                                <p className="mt-1 text-sm font-medium">{invite.status}</p>
                            </div>

                            <button
                                type="button"
                                onClick={handleAcceptInvite}
                                disabled={isAccepting || invite.status !== "pending"}
                                className="mt-6 w-full rounded-md bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
                            >
                                {isAccepting
                                    ? "Accepting..."
                                    : user
                                        ? "Accept invite"
                                        : "Login or register to accept"}
                            </button>
                        </>
                    ) : null}

                    {acceptedInvite ? (
                        <>
                            <p className="text-sm font-medium text-green-700">
                                Invite accepted
                            </p>

                            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                                You are now friends with{" "}
                                {acceptedInvite.friend.leetcode_username ?? `user #${acceptedInvite.friend.id}`}
                            </h1>

                            <p className="mt-3 text-sm text-slate-600">
                                Your shared streak will appear on the dashboard.
                            </p>
                        </>
                    ) : null}
                </section>
            </div>
        </main>
    );
}