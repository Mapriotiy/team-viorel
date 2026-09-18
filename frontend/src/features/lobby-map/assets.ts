import type { GeneratedMapPieceSize, GeneratedMapSize } from "./types";
import { mapColors } from "./mapColors";

export const GENERATED_MAP_VERSION = "island-generator-v2";

export const MAP_ASPECT_RATIO = "1321 / 900";

export const MAP_SIZES = ["small", "medium", "large"] as const satisfies readonly GeneratedMapSize[];

export const PIECE_SIZES = ["big", "med", "small"] as const satisfies readonly GeneratedMapPieceSize[];

export const PIECE_IDS = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
] as const;

export type GeneratedMapPieceId = (typeof PIECE_IDS)[number];

export const SEA_SPRITES = [
    "dolphin-cutout.webp",
    "kraken-cutout.webp",
    "mermaid-cutout.webp",
    "ruins-cutout.webp",
    "serpent-cutout.webp",
    "shark-cutout.webp",
    "ship-cutout.webp",
    "shipwreak-cutout.webp",
    "skull-cutout.webp",
] as const;

export type GeneratedMapSeaSpriteId = (typeof SEA_SPRITES)[number];

export const DEFAULT_REGION_COUNTS = {
    small: 7,
    medium: 7,
    large: 6,
} satisfies Record<GeneratedMapSize, number>;

export const PIECE_PROVINCES = {
    big: 12,
    med: 7,
    small: 4,
} satisfies Record<GeneratedMapPieceSize, number>;

export const MIN_INTERACTIVE_WIDTH = {
    big: 35,
    med: 27,
    small: 18,
} satisfies Record<GeneratedMapPieceSize, number>;

export const MAP_SIZE_CONFIG = {
    small: {
        label: "Small",
        target: 14,
        min: 12,
        max: 17,
        minPieces: 2,
        maxPieces: 3,
        gap: 5.8,
        padding: 3.2,
        fillWidth: 86,
        fillHeight: 78,
        minBig: 1,
        maxBig: 1,
    },
    medium: {
        label: "Medium",
        target: 28,
        min: 25,
        max: 31,
        minPieces: 3,
        maxPieces: 4,
        gap: 4.8,
        padding: 2.8,
        fillWidth: 88,
        fillHeight: 80,
        minBig: 1,
        maxBig: 2,
    },
    large: {
        label: "Large",
        target: 40,
        min: 37,
        max: 43,
        minPieces: 4,
        maxPieces: 5,
        gap: 3.8,
        padding: 2.4,
        fillWidth: 90,
        fillHeight: 82,
        minBig: 2,
        maxBig: 2,
    },
} satisfies Record<
    GeneratedMapSize,
    {
        label: string;
        target: number;
        min: number;
        max: number;
        minPieces: number;
        maxPieces: number;
        gap: number;
        padding: number;
        fillWidth: number;
        fillHeight: number;
        minBig: number;
        maxBig: number;
    }
>;

export const PIECE_DIMENSIONS = {
    "1": [1518, 1036],
    "2": [1518, 1036],
    "3": [1518, 1036],
    "4": [1518, 1036],
    "5": [1518, 1036],
    "6": [1028, 1530],
    "7": [1521, 1034],
    "8": [1521, 1034],
    "9": [1536, 1024],
    "10": [1536, 1024],
    "11": [1536, 1024],
    "12": [1536, 1024],
    "14": [1239, 1269],
    "15": [1254, 1254],
    "16": [1402, 1122],
    "17": [1254, 1254],
    "18": [1300, 1210],
    "19": [1254, 1254],
    "20": [1254, 1254],
} satisfies Record<GeneratedMapPieceId, [number, number]>;

export const REGION_FALLBACK_COLORS = mapColors.regionFallbackColors;

export function mapAssetUrl(path: string) {
    return `${import.meta.env.BASE_URL}${path}`;
}
