export type ProblemApiData = {
    title: string;
    title_slug: string;
    difficulty: string;
    url: string;
};

export type ProvinceApiData = {
    province_id: string;
    region_id: string;
    region_name: string;
    problem: ProblemApiData | null;
    captured_by: number | null;
    captured_by_username: string | null;
    captured_at: string | null;
    captured_submission_url: string | null;
    capturer_leetcode_username: string | null;
    captured_runtime_ms: number | null;
    first_captured_by: number | null;
    first_captured_at: string | null;
};

export type ScoreApiData = {
    player_provinces: number;
    friend_provinces: number;
    neutral_provinces: number;
    total_provinces: number;
    player_regions: number;
    friend_regions: number;
    total_regions: number;
    player_points: number;
    friend_points: number;
    player_base_points: number;
    friend_base_points: number;
    player_bonus_points: number;
    friend_bonus_points: number;
};

export type LastWeekResultApiData = {
    week_start: string;
    winner_user_id: number | null;
    winner_username: string | null;
    player_regions: number;
    friend_regions: number;
    total_regions: number;
};

export type WeeklyMapApiResponse = {
    week_start: string;
    friendship_id: number;
    provinces: ProvinceApiData[];
    score: ScoreApiData;
    player_avatar_url: string | null;
    friend_avatar_url: string | null;
    last_week_result: LastWeekResultApiData | null;
};

export type SyncApiResponse = {
    captured_count: number;
    recaptured_count: number;
    provinces: ProvinceApiData[];
    score: ScoreApiData;
    player_avatar_url: string | null;
    friend_avatar_url: string | null;
};
