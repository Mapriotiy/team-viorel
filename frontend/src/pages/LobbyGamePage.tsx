import { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { BingoBoardPage } from './BingoBoardPage';
import { LobbyMapPage } from './LobbyMapPage';

type LobbyPlayer = {
    user_id: number;
    leetcode_username: string | null;
    faction_id: number | null;
    status: string;
};

type Faction = {
    id: number;
    name: string;
    color: string;
};

type LobbyGamePageProps = {
    lobbyId: number;
    currentUserId: number;
    players: LobbyPlayer[];
    factions: Faction[];
    isAdmin: boolean;
    onBack: () => void;
    onReplay: () => void;
    onLeft: () => void;
};

// Dispatches on the lobby's game mode: territory modes render the province
// map; new board modes plug in here.
export function LobbyGamePage(props: LobbyGamePageProps) {
    const [gameMode, setGameMode] = useState<string | null>(null);

    useEffect(() => {
        apiRequest<{ game_mode: string }>(`/lobbies/${props.lobbyId}`)
            .then((lobby) => setGameMode(lobby.game_mode))
            .catch(() => setGameMode('free_for_all'));
    }, [props.lobbyId]);

    if (!gameMode) {
        return (
            <main className="min-h-screen bg-transparent p-4 text-white sm:p-6">
                Loading game...
            </main>
        );
    }

    if (gameMode === 'bingo') {
        return <BingoBoardPage {...props} />;
    }
    return <LobbyMapPage {...props} />;
}
