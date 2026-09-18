export type GameEventApiData = {
    id: number;
    province_id: string | null;
    province_name?: string | null;
    region_name?: string | null;
    event_type: string;
    actor_user_id: number;
    actor_username: string;
    actor_faction_id?: number | null;
    previous_owner_user_id: number | null;
    previous_owner_username: string | null;
    problem_title_slug: string | null;
    problem_title: string | null;
    problem_difficulty: string | null;
    points: number | null;
    runtime_ms: number | null;
    previous_runtime_ms: number | null;
    created_at: string;
};
