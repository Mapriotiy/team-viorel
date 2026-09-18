import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ActivityCalendarDay } from "../../types/dashboard";

function getHeatmapCellClass(count: number) {
    if (count <= 0) {
        return "bg-[#24201c]";
    }

    if (count === 1) {
        return "bg-[#4d3526]";
    }

    if (count <= 3) {
        return "bg-[#7a4a2c]";
    }

    if (count <= 6) {
        return "bg-[#a86138]";
    }

    return "bg-[#e6a15d]";
}

function formatMonthLabel(monthDate: Date) {
    return monthDate.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
    });
}

function getMonthStart(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function buildMonthHeatmapDays(
    selectedMonth: Date,
    activityCalendar: ActivityCalendarDay[],
) {
    const countsByDate = new Map(
        activityCalendar.map((day) => [day.date, day.count]),
    );
    const monthStart = getMonthStart(selectedMonth);
    const monthEnd = getMonthEnd(selectedMonth);
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - monthStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    const days = [];
    const cursor = new Date(gridStart);

    while (cursor <= gridEnd) {
        const dateKey = toDateKey(cursor);

        days.push({
            date: dateKey,
            count: countsByDate.get(dateKey) ?? 0,
            isCurrentMonth: cursor.getMonth() === selectedMonth.getMonth(),
        });

        cursor.setDate(cursor.getDate() + 1);
    }

    return days;
}

type ActivityCalendarProps = {
    activityCalendar: ActivityCalendarDay[];
    activeDaysCount: number;
};

export function ActivityCalendar({ activityCalendar, activeDaysCount }: ActivityCalendarProps) {
    const [selectedCalendarMonth, setSelectedCalendarMonth] = useState(() =>
        getMonthStart(new Date()),
    );

    const calendarDays = buildMonthHeatmapDays(selectedCalendarMonth, activityCalendar);
    const calendarWeekCount = Math.ceil(calendarDays.length / 7);
    const currentMonthStart = getMonthStart(new Date());
    const isCurrentCalendarMonth =
        selectedCalendarMonth.getFullYear() === currentMonthStart.getFullYear() &&
        selectedCalendarMonth.getMonth() === currentMonthStart.getMonth();

    return (
        <article className="rounded-lg border border-[#3f332d] bg-[#211a16] p-6 shadow-xl shadow-black/20">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-medium text-[#a8917d]">
                        Activity
                    </p>
                    <p className="mt-1 text-xs text-[#8f8278]">
                        {activeDaysCount} active days
                    </p>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={() =>
                            setSelectedCalendarMonth((month) => addMonths(month, -1))
                        }
                        className="grid h-7 w-7 place-items-center rounded-md border border-[#3f332d] bg-[#24201c] text-[#a8917d] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d]"
                        aria-label="Previous month"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setSelectedCalendarMonth((month) => addMonths(month, 1))
                        }
                        disabled={isCurrentCalendarMonth}
                        className="grid h-7 w-7 place-items-center rounded-md border border-[#3f332d] bg-[#24201c] text-[#a8917d] transition hover:border-[#e6a15d]/60 hover:text-[#e6a15d] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#3f332d] disabled:hover:text-[#a8917d]"
                        aria-label="Next month"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            <div className="mt-4 overflow-x-auto pb-1">
                <p className="mb-3 text-center text-xs font-medium text-[#a8917d]">
                    {formatMonthLabel(selectedCalendarMonth)}
                </p>

                <div
                    className="mx-auto grid w-fit grid-flow-col grid-rows-7 gap-1.5"
                    style={{
                        gridTemplateColumns: `repeat(${calendarWeekCount}, 1.25rem)`,
                    }}
                >
                    {calendarDays.map((day) => (
                        <div
                            key={day.date}
                            title={`${day.date}: ${day.count} submissions`}
                            className={`h-4 w-4 rounded-[4px] ${
                                day.isCurrentMonth
                                    ? getHeatmapCellClass(day.count)
                                    : "bg-[#202020]"
                            }`}
                        />
                    ))}
                </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-1 text-[11px] text-[#8f8278]">
                <span className="mr-1">Less</span>
                {[0, 1, 3, 6, 7].map((count) => (
                    <span
                        key={count}
                        className={`h-2.5 w-2.5 rounded-[2px] ${getHeatmapCellClass(count)}`}
                    />
                ))}
                <span className="ml-1">More</span>
            </div>
        </article>
    );
}
