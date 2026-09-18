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
    today_submissions: {
        title: string;
        title_slug: string;
        url: string;
        submitted_at: string;
        language: string | null;
        difficulty: string | null;
        topic_tags: string[];
    }[];
    activity_calendar: ActivityCalendarDay[];
    lobbies: DashboardLobby[];
    friends: FriendResponse[];
    stats: {
        games_played: number;
        games_won: number;
        win_rate: number;
        total_captures: number;
    };
};

export type ActivityCalendarDay = {
    date: string;
    count: number;
};

export type LobbyPlayer = {
    user_id: number;
    leetcode_username: string | null;
    faction_id: number | null;
    status: string;
};

export type Faction = {
    id: number;
    name: string;
    color: string;
};

export type DashboardLobby = {
    id: number;
    name: string;
    status: string;
    game_mode: string;
    map_size: string;
    max_players: number;
    faction_mode: boolean;
    faction_count: number;
    factions: Faction[];
    programming_language: string;
    creator_id: number;
    players: LobbyPlayer[];
    winner_id?: number | null;
    winner_faction_id?: number | null;
    finished_at?: string | null;
    replay_token?: string | null;
};

export type CreateInviteResponse = {
    token: string;
    invite_url: string;
};

export type FriendResponse = {
    friendship_id: number;
    friend: {
        id: number;
        leetcode_username: string | null;
    };
    streak: {
        display_count: number;
        current_count: number;
        longest_count: number;
        state: "lit" | "pending" | "broken";
        last_shared_active_date: string | null;
        started_at: string;
        today: {
            you_active: boolean;
            friend_active: boolean;
            shared_active: boolean;
        };
    };
};
