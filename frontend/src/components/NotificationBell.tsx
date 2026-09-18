import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { API_URL, apiRequest } from "../api/client";

type Notification = {
    id: number;
    notification_type: string;
    request_id: number | null;
    payload: Record<string, string>;
    read_at: string | null;
};

export function NotificationBell() {
    const [items, setItems] = useState<Notification[]>([]);
    const [open, setOpen] = useState(false);
    const [busyId, setBusyId] = useState<number | null>(null);
    const lastId = useRef(0);

    useEffect(() => {
        void apiRequest<Notification[]>("/friends/notifications")
            .then((next) => {
                setItems(next);
                lastId.current = Math.max(0, ...next.map((item) => item.id));
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        let cancelled = false;
        let source: EventSource | null = null;
        const onNotification = (event: MessageEvent) => {
            try {
                const item = JSON.parse(event.data) as Notification;
                lastId.current = Math.max(lastId.current, item.id);
                setItems((current) => [item, ...current.filter((existing) => existing.id !== item.id)].slice(0, 50));
            } catch {
                // Ignore malformed frames.
            }
        };
        void apiRequest<{ access_token: string }>("/auth/stream-token")
            .then(({ access_token }) => {
                if (cancelled) return;
                source = new EventSource(`${API_URL}/friends/notifications/stream?token=${encodeURIComponent(access_token)}&after_id=${lastId.current}`);
                source.addEventListener("notification", onNotification);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
            source?.close();
        };
    }, []);

    const unread = items.filter((item) => !item.read_at).length;
    const markRead = (id: number) => {
        setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
        void apiRequest(`/friends/notifications/${id}/read`, { method: "POST" });
    };

    const respondToRequest = async (notification: Notification, action: "accept" | "decline") => {
        if (!notification.request_id) return;
        setBusyId(notification.id);
        try {
            await apiRequest(`/friends/requests/${notification.request_id}/${action}`, { method: "POST" });
            markRead(notification.id);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="relative">
            <button type="button" aria-label="Notifications" onClick={() => setOpen((value) => !value)} className="relative grid h-10 w-10 place-items-center rounded-lg border border-[#3f332d] bg-[#24201c] text-[#a8917d] transition hover:border-[#7d4d32] hover:text-[#f4e7d8]">
                <Bell size={17} />
                {unread > 0 ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#d9b887] px-1 text-[10px] font-bold text-[#1d120c]">{unread}</span> : null}
            </button>
            {open ? <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-[#3f332d] bg-[#1e1812] p-3 shadow-2xl shadow-black/50">
                <p className="px-1 text-xs uppercase tracking-wider text-[#8f8278]">Notifications</p>
                <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
                    {items.length > 0 ? items.map((item) => <div key={item.id} className={`rounded-md p-2 text-sm ${item.read_at ? "text-[#8f8278]" : "bg-[#2b211c] text-[#f4e7d8]"}`}>
                        <button type="button" onClick={() => markRead(item.id)} className="w-full text-left">
                            {item.notification_type === "friend_request" ? `${item.payload.username ?? "Someone"} wants to be your friend.` : `${item.payload.username ?? "Someone"} accepted your friend request.`}
                        </button>
                        {item.notification_type === "friend_request" && !item.read_at ? <div className="mt-2 flex gap-2"><button type="button" disabled={busyId === item.id} onClick={() => void respondToRequest(item, "accept")} className="h-8 flex-1 rounded-md bg-[#d9b887] px-2 text-xs font-semibold text-[#1d120c] disabled:opacity-50">Accept</button><button type="button" disabled={busyId === item.id} onClick={() => void respondToRequest(item, "decline")} className="h-8 flex-1 rounded-md border border-[#5a4d42] px-2 text-xs font-semibold text-[#d9b887] disabled:opacity-50">Decline</button></div> : null}
                    </div>) : <p className="p-2 text-sm text-[#8f8278]">No notifications.</p>}
                </div>
            </div> : null}
        </div>
    );
}
