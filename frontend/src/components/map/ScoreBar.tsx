import type { ScoreApiData } from '../../types/map';

type ScoreBarProps = {
    scoreData: ScoreApiData;
    currentUsername: string;
    friendUsername: string;
    playerAvatarUrl: string | null;
    friendAvatarUrl: string | null;
};

export function ScoreBar({
    scoreData,
    currentUsername,
    friendUsername,
    playerAvatarUrl,
    friendAvatarUrl,
}: ScoreBarProps) {
    return (
        <section className="mt-6 rounded-lg border border-[#3a3a3a] bg-[#262626] p-4 shadow-xl shadow-black/20">
            <div className="flex items-center justify-center gap-4">
                <div className="flex shrink-0 items-center gap-2">
                    {playerAvatarUrl ? (
                        <img
                            src={playerAvatarUrl}
                            alt={currentUsername}
                            className="h-10 w-10 shrink-0 rounded-full border border-[#3a3a3a] object-cover"
                        />
                    ) : (
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#76b7a5]/20 text-sm font-bold text-[#76b7a5]">
                            {currentUsername[0].toUpperCase()}
                        </div>
                    )}
                    <div className="hidden sm:block">
                        <span className="block text-sm font-medium text-[#eff1f6]">
                            {currentUsername}
                        </span>
                        <span className="block text-xs font-semibold tabular-nums text-[#76b7a5]">
                            {scoreData.player_points.toLocaleString()} pts
                        </span>
                    </div>
                </div>

                <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-[#333]">
                    {scoreData.player_provinces > 0 && (
                        <div
                            className="h-full transition-all duration-500"
                            style={{
                                width: `${(scoreData.player_provinces / scoreData.total_provinces) * 100}%`,
                                backgroundColor: '#76b7a5',
                            }}
                        />
                    )}
                    {scoreData.neutral_provinces > 0 && (
                        <div
                            className="h-full transition-all duration-500"
                            style={{
                                width: `${(scoreData.neutral_provinces / scoreData.total_provinces) * 100}%`,
                                backgroundColor: '#555',
                            }}
                        />
                    )}
                    {scoreData.friend_provinces > 0 && (
                        <div
                            className="h-full transition-all duration-500"
                            style={{
                                width: `${(scoreData.friend_provinces / scoreData.total_provinces) * 100}%`,
                                backgroundColor: '#b86a6f',
                            }}
                        />
                    )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <div className="hidden text-right sm:block">
                        <span className="block text-sm font-medium text-[#eff1f6]">
                            {friendUsername}
                        </span>
                        <span className="block text-xs font-semibold tabular-nums text-[#b86a6f]">
                            {scoreData.friend_points.toLocaleString()} pts
                        </span>
                    </div>
                    {friendAvatarUrl ? (
                        <img
                            src={friendAvatarUrl}
                            alt={friendUsername}
                            className="h-10 w-10 shrink-0 rounded-full border border-[#3a3a3a] object-cover"
                        />
                    ) : (
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#b86a6f]/20 text-sm font-bold text-[#b86a6f]">
                            {friendUsername[0].toUpperCase()}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
