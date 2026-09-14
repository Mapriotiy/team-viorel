export type ActivityCalendarDay = {
    date: string;
    count: number;
};

export type TodaySubmission = {
    title: string;
    title_slug: string;
    url: string;
    submitted_at: string;
    language: string | null;
};

export type DashboardData = {
    leetcode_username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    leetcode_verified_at: string | null;
    current_streak: number;
    current_streak_state: "lit" | "pending" | "broken";
    today_active: boolean;
    longest_streak: number;
    active_days_count: number;
    today_submissions: TodaySubmission[];
    activity_calendar: ActivityCalendarDay[];
};