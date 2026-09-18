import type { LastWeekResultApiData } from '../../types/map';

type LastWeekBannerProps = {
    lastWeekResult: LastWeekResultApiData;
    currentUserId: number;
};

export function LastWeekBanner({ lastWeekResult, currentUserId }: LastWeekBannerProps) {
    return (
        <section className="mt-3 rounded-lg border border-[#c86f3c]/30 bg-[#c86f3c]/5 px-4 py-3 text-center text-sm shadow-sm">
            {lastWeekResult.winner_user_id === null ? (
                <span className="text-[#a3a3a3]">
                    Last week was a tie: {lastWeekResult.player_regions} vs {lastWeekResult.friend_regions} regions
                </span>
            ) : lastWeekResult.winner_user_id === currentUserId ? (
                <span className="text-[#c86f3c]">
                    You won last week: {lastWeekResult.player_regions} vs {lastWeekResult.friend_regions} regions
                </span>
            ) : (
                <span className="text-[#b86a6f]">
                    {lastWeekResult.winner_username} won last week: {lastWeekResult.friend_regions} vs {lastWeekResult.player_regions} regions
                </span>
            )}
        </section>
    );
}
