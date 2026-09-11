export type SolvedStats = {
    total: number;
    easy: number;
    medium: number;
    hard: number;
};

export type LeetCodeProfile = {
    username: string;
    real_name: string | null;
    avatar_url: string | null;
    ranking: number | null;
    solved: SolvedStats;
    submission_calendar: Record<string, string | number>;
};

export type StreakInfo = {
    current: number;
    longest: number;
};

function toKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function computeStreak(calendar: Record<string, string | number>): StreakInfo {
    const days: Record<string, boolean> = {};
    for (const [day, count] of Object.entries(calendar)) {
        days[day] = Number(count) > 0;
    }

    let cursor = new Date();
    if (!days[toKey(cursor)]) {
        cursor.setDate(cursor.getDate() - 1);
    }

    let current = 0;
    while (days[toKey(cursor)]) {
        current += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    const keys = Object.keys(days).sort();
    let longest = 0;
    let run = 0;
    let prevTs = NaN;

    for (const key of keys) {
        if (!days[key]) {
            run = 0;
            prevTs = NaN;
            continue;
        }
        const ts = new Date(`${key}T00:00:00`).getTime();
        run = ts === prevTs + 86400000 ? run + 1 : 1;
        if (run > longest) longest = run;
        prevTs = ts;
    }

    return { current, longest };
}