import { useEffect, useRef } from 'react';
import { ScrollText } from 'lucide-react';
import { eventText, relativeTime } from '../../eventText';
import type { GameEventApiData } from '../../types/events';

type EventLogPanelProps = {
    events: GameEventApiData[];
    currentUserId: number;
    className?: string;
};

export function EventLogPanel({ events, currentUserId, className = '' }: EventLogPanelProps) {
    const listRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, [events.length]);

    return (
        <aside
            className={`flex flex-col rounded-md border border-[#3f332d] bg-[#1b1512] ${className}`}
        >
            <div className="flex items-center gap-2 border-b border-[#3f332d] px-3 py-2.5">
                <ScrollText size={14} className="text-[#e6a15d]" />
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[#a8917d]">
                    Battle log
                </h2>
            </div>

            <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto p-3">
                {events.length === 0 ? (
                    <p className="text-xs text-[#8f8278]">
                        No captures yet. Solve a province's problem to plant
                        the first flag.
                    </p>
                ) : (
                    events.map((event) => {
                        const isPlayer = event.actor_user_id === currentUserId;
                        const accent = isPlayer ? '#76b7a5' : '#b86a6f';
                        const isSteal = event.event_type === 'recapture';

                        return (
                            <div
                                key={event.id}
                                className="rounded-md border px-2.5 py-2 text-xs"
                                style={{
                                    borderColor: accent + (isSteal ? '80' : '33'),
                                    backgroundColor: accent + (isSteal ? '14' : '0a'),
                                }}
                            >
                                <p className="text-[#f4e7d8]">
                                    {eventText(event, currentUserId)}
                                </p>
                                <p className="mt-1 text-[0.625rem] text-[#8f8278]">
                                    {relativeTime(event.created_at)}
                                </p>
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
