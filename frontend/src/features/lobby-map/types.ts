export type GeneratedMapSize = "small" | "medium" | "large";
export type GeneratedMapPieceSize = "big" | "med" | "small";

export type LobbyMapTopic = {
    id: string;
    name: string;
    color: string;
};

export type GeneratedMapIsland = {
    islandId: string;
    assetId: string;
    size: GeneratedMapPieceSize;
    left: number;
    top: number;
    width: number;
    aspectRatio: string;
    rotation: number;
    zIndex: number;
    svgPath: string;
    backPath: string;
};

export type GeneratedMapSeaSprite = {
    id: string;
    src: string;
    left: number;
    top: number;
    width: number;
    rotation: number;
    opacity: number;
};

export type GeneratedMapProvince = {
    provinceId: string;
    name: string;
    islandId: string;
    pathIndex: number;
    regionId: string;
};

export type GeneratedMapRegion = {
    regionId: string;
    topicId: string;
    name: string;
    color: string;
    provinceIds: string[];
    provinceCount: number;
    splitAcrossIslands: boolean;
};

export type GeneratedMapMarker = {
    provinceId: string;
    islandId: string;
    left: number;
    top: number;
    scale: number;
};

export type GeneratedMapRoad = {
    id: string;
    islandId: string;
    d: string;
    opacity: number;
    dashOffset: number;
};

export type GeneratedMapDraft = {
    schemaVersion: 1;
    generatorVersion: string;
    id: string;
    createdAt: string;
    size: GeneratedMapSize;
    regionCount: number;
    provinceCount: number;
    seaBaseSrc: string;
    topics: LobbyMapTopic[];
    islands: GeneratedMapIsland[];
    seaSprites: GeneratedMapSeaSprite[];
    provinces: GeneratedMapProvince[];
    regions: GeneratedMapRegion[];
    markers?: GeneratedMapMarker[];
    roads?: GeneratedMapRoad[];
};

export type LobbyMapSelection = { kind: "generated"; draft: GeneratedMapDraft };
