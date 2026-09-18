    import {
    GENERATED_MAP_VERSION,
    MAP_SIZE_CONFIG,
    MIN_INTERACTIVE_WIDTH,
    PIECE_DIMENSIONS,
    PIECE_IDS,
    PIECE_PROVINCES,
    REGION_FALLBACK_COLORS,
    SEA_SPRITES,
    mapAssetUrl,
    type GeneratedMapPieceId,
} from "./assets";
import type {
    GeneratedMapDraft,
    GeneratedMapIsland,
    GeneratedMapMarker,
    GeneratedMapPieceSize,
    GeneratedMapProvince,
    GeneratedMapRegion,
    GeneratedMapRoad,
    GeneratedMapSeaSprite,
    GeneratedMapSize,
    LobbyMapTopic,
} from "./types";

type LayoutPiece = {
    id: GeneratedMapPieceId;
    size: GeneratedMapPieceSize;
    left: number;
    top: number;
    width: number;
    aspectRatio: string;
    rotation: number;
    zIndex: number;
    prefix: string;
};

type Rect = { left: number; top: number; width: number; height: number };

const DEFAULT_TOPIC: LobbyMapTopic = {
    id: "default-region",
    name: "Region",
    color: REGION_FALLBACK_COLORS[0],
};

const PROVINCE_ADJECTIVES = [
    "Ashen",
    "Black",
    "Bright",
    "Copper",
    "Crimson",
    "Deep",
    "Dusken",
    "Ember",
    "Frost",
    "Grey",
    "Iron",
    "Moonlit",
    "Old",
    "Raven",
    "Salt",
    "Sable",
    "Silver",
    "Storm",
    "Verdant",
    "Wild",
] as const;

const PROVINCE_FEATURES = [
    "Bay",
    "Bluff",
    "Cairn",
    "Coast",
    "Crown",
    "Drift",
    "Fen",
    "Field",
    "Gate",
    "Glen",
    "Harbor",
    "Hollow",
    "March",
    "Mesa",
    "Mire",
    "Pass",
    "Reach",
    "Ridge",
    "Shore",
    "Watch",
] as const;

const PROVINCE_SUFFIXES = [
    "",
    "",
    "",
    "Heights",
    "Point",
    "Rest",
    "Run",
    "Spire",
    "Vale",
    "Ward",
] as const;

const TOPIC_FEATURE_HINTS: Array<{ pattern: RegExp; features: readonly string[] }> = [
    { pattern: /tree|graph/i, features: ["Root", "Canopy", "Branch", "Grove"] },
    { pattern: /binary|search/i, features: ["Pivot", "Midpoint", "Split", "Index"] },
    { pattern: /hard/i, features: ["Obsidian", "Trial", "Gauntlet", "Dread"] },
    { pattern: /linked|list/i, features: ["Node", "Chain", "Sentinel", "Pointer"] },
    { pattern: /pointer|window/i, features: ["Tide", "Window", "Drift", "Twin"] },
    { pattern: /array|hash/i, features: ["Key", "Bucket", "Index", "Cipher"] },
    { pattern: /stack/i, features: ["Stack", "Peak", "Push", "Pop"] },
] as const;

function randomItem<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
    return Math.round(value * 100) / 100;
}

function pieceAspect(id: GeneratedMapPieceId) {
    const [width, height] = PIECE_DIMENSIONS[id];
    return width / height;
}

function pieceHeight(width: number, id: GeneratedMapPieceId) {
    return width / pieceAspect(id);
}

function pieceVisualRect(piece: Pick<LayoutPiece, "id" | "left" | "top" | "width" | "rotation">): Rect {
    const height = pieceHeight(piece.width, piece.id);
    const bounds = rotatedBounds(piece.width, height, piece.rotation);
    return {
        left: piece.left - (bounds.width - piece.width) / 2,
        top: piece.top - (bounds.height - height) / 2,
        width: bounds.width,
        height: bounds.height,
    };
}

function inflateRect(rect: Rect, amount: number): Rect {
    return {
        left: rect.left - amount,
        top: rect.top - amount,
        width: rect.width + amount * 2,
        height: rect.height + amount * 2,
    };
}

function rectIntersectionArea(a: Rect, b: Rect) {
    const overlapX = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
    const overlapY = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
    return overlapX * overlapY;
}

function rectCenterDistance(a: Rect, b: Rect) {
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;
    return Math.hypot(ax - bx, ay - by);
}

function rotatedBounds(width: number, height: number, rotation: number) {
    const radians = (Math.abs(rotation) * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
        width: width * cos + height * sin,
        height: width * sin + height * cos,
    };
}

function randomRotation(size: GeneratedMapPieceSize) {
    const maxRotation = size === "big" ? 26 : size === "med" ? 36 : 44;
    return Math.round(randomBetween(-maxRotation, maxRotation) * 10) / 10;
}

function randomPieceWidth(size: GeneratedMapPieceSize, scale: GeneratedMapSize, index: number) {
    const ranges = {
        small: {
            big: [58, 68],
            med: [46, 55],
            small: [31, 38],
        },
        medium: {
            big: [46, 55],
            med: [35, 43],
            small: [24, 30],
        },
        large: {
            big: [34, 41],
            med: [26, 33],
            small: [18, 23],
        },
    } satisfies Record<GeneratedMapSize, Record<GeneratedMapPieceSize, [number, number]>>;
    const [min, max] = ranges[scale][size];
    const continentBoost = size === "big" && index === 0 ? 1.12 : size === "big" && scale === "large" && index === 1 ? 1.06 : 1;
    return Math.round(Math.max(MIN_INTERACTIVE_WIDTH[size], randomBetween(min, max) * continentBoost) * 10) / 10;
}

function createSizePlan(scale: GeneratedMapSize) {
    const config = MAP_SIZE_CONFIG[scale];
    let best: GeneratedMapPieceSize[] = ["big"];
    let bestScore = Number.POSITIVE_INFINITY;

    for (let attempt = 0; attempt < 500; attempt += 1) {
        const pieceCount = config.minPieces + Math.floor(Math.random() * (config.maxPieces - config.minPieces + 1));
        const sizes: GeneratedMapPieceSize[] = Array.from({ length: config.minBig }, () => "big");
        while (sizes.length < pieceCount) {
            const roll = Math.random();
            if (scale === "small") {
                sizes.push(roll < 0.62 ? "med" : "small");
                continue;
            }
            if (scale === "medium") {
                if (roll < 0.3 && sizes.filter((size) => size === "big").length < config.maxBig) {
                    sizes.push("big");
                } else {
                    sizes.push(roll < 0.76 ? "med" : "small");
                }
                continue;
            }
            sizes.push(roll < 0.68 ? "med" : "small");
        }

        const total = sizes.reduce((sum, size) => sum + PIECE_PROVINCES[size], 0);
        const bigCount = sizes.filter((size) => size === "big").length;
        const rangePenalty = total < config.min || total > config.max ? 20 : 0;
        const bigPenalty =
            bigCount < config.minBig
                ? (config.minBig - bigCount) * 30
                : bigCount > config.maxBig
                  ? (bigCount - config.maxBig) * 30
                  : 0;
        const score = Math.abs(total - config.target) + rangePenalty + bigPenalty + Math.random() * 0.6;

        if (score < bestScore) {
            const continents = sizes.filter((size) => size === "big");
            const others = sizes.filter((size) => size !== "big").sort(() => Math.random() - 0.5);
            best = [...continents.slice(0, config.minBig), ...others, ...continents.slice(config.minBig, config.maxBig)];
            bestScore = score;
        }
    }

    return best;
}

// Combined collision + penalty pass over already-placed pieces using rects that
// were computed once by the caller. Avoids recomputing each placed piece's
// visual/inflated rect on every candidate attempt (the hot loop): a hard
// collision is any positive inflated-overlap, and the penalty sums overlap area
// plus a proximity term, matching the previous per-attempt implementation.
function evaluatePlacement(
    candidate: Rect,
    placedRects: readonly Rect[],
    placedInflated: readonly Rect[],
    gap: number,
) {
    const inflatedCandidate = inflateRect(candidate, gap);
    let penalty = 0;
    let hardCollision = false;
    for (let i = 0; i < placedRects.length; i += 1) {
        const collision = rectIntersectionArea(inflatedCandidate, placedInflated[i]);
        if (collision > 0) hardCollision = true;
        const distance = rectCenterDistance(candidate, placedRects[i]);
        const distancePenalty = Math.max(0, 32 - distance) / 32;
        penalty += collision * 5 + distancePenalty * 80;
    }
    return { penalty, hardCollision };
}

function layoutBounds(pieces: readonly LayoutPiece[]) {
    const rects = pieces.map(pieceVisualRect);
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.left + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
    return { left, top, width: right - left, height: bottom - top };
}

function expandLayoutToFill(pieces: LayoutPiece[], scale: GeneratedMapSize) {
    if (!pieces.length) return pieces;
    const config = MAP_SIZE_CONFIG[scale];
    const current = layoutBounds(pieces);
    const fitScale = Math.min(config.fillWidth / current.width, config.fillHeight / current.height, 1.45);
    const next = pieces.map((piece) => {
        const centerX = piece.left + piece.width / 2;
        const centerY = piece.top + pieceHeight(piece.width, piece.id) / 2;
        const scaledWidth = Math.round(piece.width * fitScale * 10) / 10;
        const scaledHeight = pieceHeight(scaledWidth, piece.id);
        const nextCenterX = 50 + (centerX - (current.left + current.width / 2)) * fitScale;
        const nextCenterY = 50 + (centerY - (current.top + current.height / 2)) * fitScale;
        return {
            ...piece,
            left: Math.round((nextCenterX - scaledWidth / 2) * 10) / 10,
            top: Math.round((nextCenterY - scaledHeight / 2) * 10) / 10,
            width: scaledWidth,
        };
    });

    const bounds = layoutBounds(next);
    const shiftX = Math.max(config.padding - bounds.left, Math.min(100 - config.padding - (bounds.left + bounds.width), 0));
    const shiftY = Math.max(config.padding - bounds.top, Math.min(100 - config.padding - (bounds.top + bounds.height), 0));
    return next.map((piece) => ({
        ...piece,
        left: Math.round((piece.left + shiftX) * 10) / 10,
        top: Math.round((piece.top + shiftY) * 10) / 10,
    }));
}

function layoutOverlapScore(pieces: readonly LayoutPiece[], gap: number) {
    let score = 0;
    for (let a = 0; a < pieces.length; a += 1) {
        for (let b = a + 1; b < pieces.length; b += 1) {
            score += rectIntersectionArea(inflateRect(pieceVisualRect(pieces[a]), gap), inflateRect(pieceVisualRect(pieces[b]), gap));
        }
    }
    return score;
}

function layoutSymmetryScore(pieces: readonly LayoutPiece[], scale: GeneratedMapSize) {
    const quadrants = [0, 0, 0, 0];
    pieces.forEach((piece) => {
        const rect = pieceVisualRect(piece);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const quadrant = (centerX >= 50 ? 1 : 0) + (centerY >= 50 ? 2 : 0);
        quadrants[quadrant] += PIECE_PROVINCES[piece.size];
    });

    const occupied = quadrants.filter((value) => value > 0);
    const average = occupied.reduce((sum, value) => sum + value, 0) / Math.max(1, occupied.length);
    const variance = occupied.reduce((sum, value) => sum + Math.abs(value - average), 0) / Math.max(1, occupied.length);
    const fourCornerPenalty = occupied.length === 4 ? (scale === "large" ? 280 : 140) : 0;
    const evennessPenalty = Math.max(0, 7 - variance) * (scale === "large" ? 18 : 9);
    return fourCornerPenalty + evennessPenalty;
}

function createPieceLayout(
    index: number,
    size: GeneratedMapPieceSize,
    scale: GeneratedMapSize,
    placed: LayoutPiece[],
    availableIds: readonly GeneratedMapPieceId[],
): LayoutPiece {
    const config = MAP_SIZE_CONFIG[scale];
    const id = randomItem(availableIds);
    const padding = config.padding;
    const rotation = randomRotation(size);
    // The placed pieces don't change while we search for this piece's spot, so
    // compute their (inflated) rects once instead of per candidate attempt.
    const placedRects = placed.map(pieceVisualRect);
    const placedInflated = placedRects.map((rect) => inflateRect(rect, config.gap));
    const maxWidthByHeight = (100 - padding * 2) * pieceAspect(id);
    const minInteractiveWidth = Math.min(MIN_INTERACTIVE_WIDTH[size], maxWidthByHeight);
    let width = Math.min(randomPieceWidth(size, scale, index), maxWidthByHeight);
    let height = pieceHeight(width, id);
    let bounds = rotatedBounds(width, height, rotation);
    let best = {
        left: randomBetween(padding + (bounds.width - width) / 2, 100 - padding - width - (bounds.width - width) / 2),
        top: randomBetween(padding + (bounds.height - height) / 2, 100 - padding - height - (bounds.height - height) / 2),
        score: Number.POSITIVE_INFINITY,
    };

    for (let shrink = 0; shrink < 8; shrink += 1) {
        height = pieceHeight(width, id);
        bounds = rotatedBounds(width, height, rotation);
        const minLeft = padding + (bounds.width - width) / 2;
        const maxLeft = 100 - padding - width - (bounds.width - width) / 2;
        const minTop = padding + (bounds.height - height) / 2;
        const maxTop = 100 - padding - height - (bounds.height - height) / 2;
        best = {
            left: randomBetween(minLeft, maxLeft),
            top: randomBetween(minTop, maxTop),
            score: Number.POSITIVE_INFINITY,
        };

        for (let attempt = 0; attempt < 240; attempt += 1) {
            const candidate = {
                left: randomBetween(minLeft, maxLeft) - (bounds.width - width) / 2,
                top: randomBetween(minTop, maxTop) - (bounds.height - height) / 2,
                width: bounds.width,
                height: bounds.height,
            };
            const centerBias =
                Math.abs(candidate.left + candidate.width / 2 - 50) * 0.05 +
                Math.abs(candidate.top + candidate.height / 2 - 50) * 0.035;
            const { penalty, hardCollision } = evaluatePlacement(candidate, placedRects, placedInflated, config.gap);
            const score = (hardCollision ? 100000 : 0) + penalty + centerBias;

            if (score < best.score) {
                best = { left: candidate.left, top: candidate.top, score };
            }
            if (!hardCollision && score < 1) break;
        }

        if (best.score < 100000 || width <= minInteractiveWidth) break;
        width = Math.max(minInteractiveWidth, Math.round(width * 0.92 * 10) / 10);
    }

    height = pieceHeight(width, id);
    bounds = rotatedBounds(width, height, rotation);
    const minLeft = padding + (bounds.width - width) / 2;
    const maxLeft = 100 - padding - width - (bounds.width - width) / 2;
    const minTop = padding + (bounds.height - height) / 2;
    const maxTop = 100 - padding - height - (bounds.height - height) / 2;
    const left = clamp(best.left + (bounds.width - width) / 2, minLeft, maxLeft);
    const top = clamp(best.top + (bounds.height - height) / 2, minTop, maxTop);

    return {
        id,
        size,
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        width,
        aspectRatio: `${PIECE_DIMENSIONS[id][0]} / ${PIECE_DIMENSIONS[id][1]}`,
        rotation,
        zIndex: size === "big" ? 1 : size === "med" ? 2 : 3,
        prefix: `island${index + 1}-${size}`,
    };
}

function createLayout(sizePlan: readonly GeneratedMapPieceSize[], scale: GeneratedMapSize) {
    const availableIds = [...PIECE_IDS];
    const placed = sizePlan.reduce<LayoutPiece[]>((pieces, size, index) => {
        const piece = createPieceLayout(index, size, scale, pieces, availableIds);
        pieces.push(piece);
        const usedIndex = availableIds.indexOf(piece.id);
        if (usedIndex >= 0) availableIds.splice(usedIndex, 1);
        return pieces;
    }, []);
    return expandLayoutToFill(placed, scale);
}

function createBestLayout(sizePlan: readonly GeneratedMapPieceSize[], scale: GeneratedMapSize) {
    const config = MAP_SIZE_CONFIG[scale];
    let best = createLayout(sizePlan, scale);
    let bestScore = layoutOverlapScore(best, config.gap) * 10 + layoutSymmetryScore(best, scale);

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = createLayout(sizePlan, scale);
        const score = layoutOverlapScore(candidate, config.gap) * 10 + layoutSymmetryScore(candidate, scale);
        if (score < bestScore) {
            best = candidate;
            bestScore = score;
        }
        if (score < 1) break;
    }

    return best;
}

function createSeaSprites(islands: readonly LayoutPiece[], scale: GeneratedMapSize): GeneratedMapSeaSprite[] {
    const available = [...SEA_SPRITES];
    const targetCount = Math.min(available.length, 2);
    const islandRects = islands.map((piece) => inflateRect(pieceVisualRect(piece), 4.5));
    const sprites: Array<GeneratedMapSeaSprite & { height: number }> = [];
    const diagonal = Math.random() < 0.5 ? "main" : "anti";
    const anchors =
        diagonal === "main"
            ? [
                  { left: [4, 15], top: [5, 17] },
                  { left: [73, 86], top: [70, 83] },
              ]
            : [
                  { left: [73, 86], top: [5, 17] },
                  { left: [4, 15], top: [70, 83] },
              ];
    const edgeFallbacks = [
        { left: [4, 18], top: [22, 55] },
        { left: [78, 90], top: [22, 55] },
        { left: [22, 58], top: [5, 15] },
        { left: [22, 58], top: [74, 84] },
    ];

    for (let index = 0; index < targetCount; index += 1) {
        const spriteId = randomItem(available);
        available.splice(available.indexOf(spriteId), 1);
        let width = Math.round(randomBetween(17.2, scale === "large" ? 25.5 : 27.8) * 10) / 10;
        let best = {
            left: 0,
            top: 0,
            score: Number.POSITIVE_INFINITY,
            found: false,
        };

        for (let shrink = 0; shrink < 5; shrink += 1) {
            const height = width * 0.93;
            const primary = anchors[index % anchors.length];
            const zones = [primary, ...edgeFallbacks.sort(() => Math.random() - 0.5)];

            for (const zone of zones) {
                for (let attempt = 0; attempt < 120; attempt += 1) {
                    const maxLeft = Math.min(zone.left[1], 96 - width);
                    const maxTop = Math.min(zone.top[1], 95 - height);
                    if (maxLeft < zone.left[0] || maxTop < zone.top[0]) continue;

                    const candidate = {
                        left: randomBetween(zone.left[0], maxLeft),
                        top: randomBetween(zone.top[0], maxTop),
                        width,
                        height,
                    };
                    const islandOverlap = islandRects.reduce((sum, rect) => sum + rectIntersectionArea(candidate, rect), 0);
                    if (islandOverlap > 0) continue;

                    const spritePenalty = sprites.reduce((sum, sprite) => {
                        const spriteRect = {
                            left: sprite.left,
                            top: sprite.top,
                            width: sprite.width,
                            height: sprite.height,
                        };
                        const spriteDistance = rectCenterDistance(candidate, spriteRect);
                        const tooClosePenalty = Math.max(0, 32 - spriteDistance) * 160;
                        return (
                            sum +
                            rectIntersectionArea(inflateRect(candidate, 10), inflateRect(spriteRect, 10)) * 90 +
                            tooClosePenalty
                        );
                    }, 0);
                    if (spritePenalty > 0) continue;

                    const anchorCenterX = (primary.left[0] + primary.left[1]) / 2;
                    const anchorCenterY = (primary.top[0] + primary.top[1]) / 2;
                    const score =
                        Math.abs(candidate.left - anchorCenterX) * 0.18 +
                        Math.abs(candidate.top - anchorCenterY) * 0.14 +
                        (zone === primary ? 0 : 12);

                    if (score < best.score) {
                        best = { left: candidate.left, top: candidate.top, score, found: true };
                    }
                    if (zone === primary && attempt > 20) break;
                }
            }

            if (best.found) break;
            width = Math.round(width * 0.9 * 10) / 10;
        }

        if (best.found) {
            const height = width * 0.93;
            sprites.push({
                id: spriteId,
                src: `map-test/sprites/${spriteId}`,
                left: Math.round(best.left * 10) / 10,
                top: Math.round(best.top * 10) / 10,
                width,
                height,
                rotation: 0,
                opacity: Math.round(randomBetween(0.38, 0.56) * 100) / 100,
            });
        }
    }

    return sprites.map(({ height: _height, ...sprite }) => sprite);
}

function getAttr(tag: string, name: string) {
    const match = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
    return match?.[1] ?? match?.[2] ?? null;
}

function parseViewBox(svgText: string) {
    const svgTag = svgText.match(/<svg\b[^>]*>/i)?.[0] ?? "";
    const viewBox = getAttr(svgTag, "viewBox");
    if (viewBox) {
        const values = viewBox.trim().split(/[\s,]+/).map(Number);
        if (values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0) {
            return { x: values[0], y: values[1], width: values[2], height: values[3] };
        }
    }

    const width = Number(getAttr(svgTag, "width"));
    const height = Number(getAttr(svgTag, "height"));
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return { x: 0, y: 0, width, height };
    }

    return { x: 0, y: 0, width: 100, height: 100 };
}

function pathCentroid(pathTag: string, fallbackIndex: number) {
    const d = getAttr(pathTag, "d") ?? "";
    const subpaths = d.split(/[Mm]/).filter(Boolean);
    if (!subpaths.length) return { x: fallbackIndex, y: fallbackIndex };

    let best: { x: number; y: number } | null = null;
    let bestCount = 0;
    for (const subpath of subpaths) {
        const values = [...subpath.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
        if (values.length < 2) continue;
        let x = 0;
        let y = 0;
        let count = 0;
        for (let index = 0; index < values.length - 1; index += 2) {
            x += values[index];
            y += values[index + 1];
            count += 1;
        }
        if (count > bestCount) {
            bestCount = count;
            best = { x: x / count, y: y / count };
        }
    }

    return best ?? { x: fallbackIndex, y: fallbackIndex };
}

function orderProvincePaths(points: { x: number; y: number }[]) {
    const unused = points.map((_, index) => index);
    const ordered: number[] = [];
    let current = unused.reduce((best, index) => {
        const bestPoint = points[best];
        const point = points[index];
        return point.x + point.y < bestPoint.x + bestPoint.y ? index : best;
    }, unused[0] ?? 0);

    while (unused.length) {
        ordered.push(current);
        unused.splice(unused.indexOf(current), 1);
        if (!unused.length) break;
        const currentPoint = points[current];
        current = unused.reduce((best, index) => {
            const bestPoint = points[best];
            const point = points[index];
            const bestDistance = Math.hypot(bestPoint.x - currentPoint.x, bestPoint.y - currentPoint.y);
            const distance = Math.hypot(point.x - currentPoint.x, point.y - currentPoint.y);
            return distance < bestDistance ? index : best;
        }, unused[0]);
    }

    return ordered;
}

function createRegionQuotas(totalProvinces: number, desiredRegions: number) {
    const count = Math.max(1, Math.min(desiredRegions, totalProvinces));
    const base = Math.floor(totalProvinces / count);
    const extra = totalProvinces % count;
    return Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0));
}

function pieceCenter(piece: Pick<LayoutPiece, "id" | "left" | "top" | "width">) {
    return {
        x: piece.left + piece.width / 2,
        y: piece.top + pieceHeight(piece.width, piece.id) / 2,
    };
}

function nearestPieceOrder(pieces: readonly LayoutPiece[]) {
    const unused = pieces.map((_, index) => index);
    const ordered: number[] = [];
    let current = unused.reduce((best, index) => {
        const bestCenter = pieceCenter(pieces[best]);
        const center = pieceCenter(pieces[index]);
        return center.x + center.y < bestCenter.x + bestCenter.y ? index : best;
    }, unused[0] ?? 0);

    while (unused.length) {
        ordered.push(current);
        unused.splice(unused.indexOf(current), 1);
        if (!unused.length) break;
        const currentCenter = pieceCenter(pieces[current]);
        current = unused.reduce((best, index) => {
            const bestCenter = pieceCenter(pieces[best]);
            const center = pieceCenter(pieces[index]);
            const bestDistance = Math.hypot(bestCenter.x - currentCenter.x, bestCenter.y - currentCenter.y);
            const distance = Math.hypot(center.x - currentCenter.x, center.y - currentCenter.y);
            return distance < bestDistance ? index : best;
        }, unused[0]);
    }

    return ordered;
}

function getPathTags(svgText: string) {
    return [...svgText.matchAll(/<path\b[^>]*>/g)].map((match) => match[0]);
}

function createBalancedRegionAssignments(texts: readonly string[], pieces: readonly LayoutPiece[], desiredRegions: number) {
    const pathTagsByPiece = texts.map(getPathTags);
    const totalProvinces = pathTagsByPiece.reduce((sum, tags) => sum + tags.length, 0);
    const quotas = createRegionQuotas(totalProvinces, desiredRegions);
    const assignments = pathTagsByPiece.map((tags) => new Array<number>(tags.length).fill(0));
    const pieceOrder = nearestPieceOrder(pieces);
    let regionIndex = 0;
    let usedInRegion = 0;

    for (const pieceIndex of pieceOrder) {
        const tags = pathTagsByPiece[pieceIndex];
        const points = tags.map((tag, index) => pathCentroid(tag, index));
        const pathOrder = orderProvincePaths(points);

        for (const pathIndex of pathOrder) {
            while (usedInRegion >= quotas[regionIndex] && regionIndex < quotas.length - 1) {
                regionIndex += 1;
                usedInRegion = 0;
            }
            assignments[pieceIndex][pathIndex] = regionIndex;
            usedInRegion += 1;
        }
    }

    return { assignments, quotas, pathTagsByPiece, totalProvinces };
}

async function fetchSvgText(path: string) {
    const response = await fetch(mapAssetUrl(path));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
}

function hexToRgb(hex: string) {
    const normalized = hex.trim().replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
    };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
    return `#${[r, g, b]
        .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
        .join("")}`;
}

function mixHex(base: string, target: string, baseWeight: number) {
    const a = hexToRgb(base);
    const b = hexToRgb(target);
    if (!a || !b) return base;
    const targetWeight = 1 - baseWeight;
    return rgbToHex({
        r: a.r * baseWeight + b.r * targetWeight,
        g: a.g * baseWeight + b.g * targetWeight,
        b: a.b * baseWeight + b.b * targetWeight,
    });
}

function mutedTopicColor(color: string, index: number) {
    const fallback = REGION_FALLBACK_COLORS[index % REGION_FALLBACK_COLORS.length];
    const base = hexToRgb(color) ? color : fallback;
    return mixHex(base, "#343936", 0.58);
}

function normalizeTopics(topics: readonly LobbyMapTopic[], provinceCount: number) {
    const usable = topics.length ? topics : [DEFAULT_TOPIC];
    const maxCount = Math.max(1, Math.min(usable.length, provinceCount));
    return usable.slice(0, maxCount).map((topic, index) => ({
        ...topic,
        color: mutedTopicColor(topic.color || REGION_FALLBACK_COLORS[index % REGION_FALLBACK_COLORS.length], index),
    }));
}

function layoutToIsland(piece: LayoutPiece): GeneratedMapIsland {
    return {
        islandId: piece.prefix,
        assetId: piece.id,
        size: piece.size,
        left: piece.left,
        top: piece.top,
        width: piece.width,
        aspectRatio: piece.aspectRatio,
        rotation: piece.rotation,
        zIndex: piece.zIndex,
        svgPath: `map-test/pieces/${piece.size}/${piece.id}.svg`,
        backPath: `map-test/backs/${piece.id}.webp`,
    };
}

function islandToLayout(island: GeneratedMapIsland): LayoutPiece {
    return {
        id: island.assetId as GeneratedMapPieceId,
        size: island.size,
        left: island.left,
        top: island.top,
        width: island.width,
        aspectRatio: island.aspectRatio,
        rotation: island.rotation,
        zIndex: island.zIndex,
        prefix: island.islandId,
    };
}

function createProvinceId(islandId: string, pathIndex: number) {
    return `${islandId}-province-${String(pathIndex + 1).padStart(3, "0")}`;
}

function hashString(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
}

function parseAspectRatioValue(value: string) {
    const parts = value.split("/").map((part) => Number(part.trim()));
    const width = parts[0];
    const height = parts[1];
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return 1321 / 900;
    }
    return width / height;
}

function islandRelativeArea(island: GeneratedMapIsland) {
    const aspectRatio = parseAspectRatioValue(island.aspectRatio);
    const height = island.width / aspectRatio;
    return island.width * height;
}

function islandMarkerBaseScale(island: GeneratedMapIsland, islands: readonly GeneratedMapIsland[]) {
    const area = islandRelativeArea(island);
    const averageArea =
        islands.reduce((total, currentIsland) => total + islandRelativeArea(currentIsland), 0) /
        Math.max(1, islands.length);
    const relativeSize = Math.sqrt(area / Math.max(averageArea, 1));

    return clamp(0.86 + (relativeSize - 1) * 0.34, 0.68, 1.16);
}

function roadKey(a: Pick<GeneratedMapMarker, "provinceId">, b: Pick<GeneratedMapMarker, "provinceId">) {
    return [a.provinceId, b.provinceId].sort().join("~");
}

function curvedRoadPath(a: GeneratedMapMarker, b: GeneratedMapMarker, seed: number) {
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / distance;
    const ny = dx / distance;
    const direction = seed % 2 === 0 ? 1 : -1;
    const bend = direction * clamp(distance * (0.05 + (seed % 7) * 0.006), 0.65, 3.1);
    const wobble = ((seed >> 4) % 5 - 2) * 0.12;

    const c1x = clamp(a.left + dx * 0.38 + nx * (bend + wobble), 4, 96);
    const c1y = clamp(a.top + dy * 0.36 + ny * (bend - wobble), 4, 96);
    const c2x = clamp(a.left + dx * 0.64 + nx * (bend - wobble), 4, 96);
    const c2y = clamp(a.top + dy * 0.66 + ny * (bend + wobble), 4, 96);

    return `M ${a.left.toFixed(2)} ${a.top.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(
        2,
    )}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${b.left.toFixed(2)} ${b.top.toFixed(2)}`;
}

function createIslandRoads(markers: GeneratedMapMarker[], islandId: string): GeneratedMapRoad[] {
    if (markers.length < 2) return [];

    const candidates = markers
        .flatMap((marker, index) =>
            markers.slice(index + 1).map((other) => ({
                a: marker,
                b: other,
                distance: Math.hypot(marker.left - other.left, marker.top - other.top),
                seed: hashString(roadKey(marker, other)),
            })),
        )
        .sort((a, b) => a.distance - b.distance || a.seed - b.seed);

    const parent = new Map(markers.map((marker) => [marker.provinceId, marker.provinceId]));
    const find = (id: string): string => {
        const current = parent.get(id) ?? id;
        if (current === id) return id;
        const root = find(current);
        parent.set(id, root);
        return root;
    };
    const connect = (a: GeneratedMapMarker, b: GeneratedMapMarker) => {
        const rootA = find(a.provinceId);
        const rootB = find(b.provinceId);
        if (rootA === rootB) return false;
        parent.set(rootB, rootA);
        return true;
    };

    const roads = new Map<string, { a: GeneratedMapMarker; b: GeneratedMapMarker; distance: number; seed: number }>();
    for (const candidate of candidates) {
        if (!connect(candidate.a, candidate.b)) continue;
        roads.set(roadKey(candidate.a, candidate.b), candidate);
        if (roads.size >= markers.length - 1) break;
    }

    const connectedDistances = [...roads.values()].map((road) => road.distance);
    const averageRoadDistance =
        connectedDistances.reduce((total, distance) => total + distance, 0) / Math.max(1, connectedDistances.length);
    const extraMaxDistance = clamp(averageRoadDistance * 1.58, 14, 32);
    const extraLimit = Math.max(2, Math.floor(markers.length * 0.52));
    let extraCount = 0;

    for (const candidate of candidates) {
        if (extraCount >= extraLimit) break;
        const key = roadKey(candidate.a, candidate.b);
        const isShortBypass = candidate.distance <= averageRoadDistance * 1.02 && candidate.seed % 100 < 52;
        const isCrossRoad = candidate.distance <= extraMaxDistance && candidate.seed % 100 < 38;
        if (roads.has(key) || (!isShortBypass && !isCrossRoad)) continue;
        roads.set(key, candidate);
        extraCount += 1;
    }

    const longestRoad = Math.max(...[...roads.values()].map((road) => road.distance), 1);
    return [...roads.values()]
        .sort((a, b) => a.distance - b.distance || a.seed - b.seed)
        .map(({ a, b, distance, seed }) => ({
            id: roadKey(a, b),
            islandId,
            d: curvedRoadPath(a, b, seed),
            opacity: round2(clamp(0.42 + (longestRoad - distance) / longestRoad * 0.26, 0.34, 0.68)),
            dashOffset: seed % 11,
        }));
}

function topicFeatures(topicName: string) {
    return TOPIC_FEATURE_HINTS.find((hint) => hint.pattern.test(topicName))?.features ?? PROVINCE_FEATURES;
}

function pickNamePart<T>(items: readonly T[], seed: number, salt: number) {
    return items[(seed + salt * 7919) % items.length];
}

function createProvinceName({
    islandId,
    pathIndex,
    region,
    usedNames,
}: {
    islandId: string;
    pathIndex: number;
    region: GeneratedMapRegion;
    usedNames: Set<string>;
}) {
    const seed = hashString(`${islandId}:${pathIndex}:${region.topicId}:${region.name}`);
    const adjective = pickNamePart(PROVINCE_ADJECTIVES, seed, 1);
    const featurePool = topicFeatures(region.name);
    const feature = pickNamePart(featurePool, seed, 2);
    const suffix = pickNamePart(PROVINCE_SUFFIXES, seed, 3);
    const candidates = [
        `${adjective} ${feature}${suffix ? ` ${suffix}` : ""}`,
        `${feature}${suffix ? ` ${suffix}` : ""}`,
        `${adjective} ${pickNamePart(PROVINCE_FEATURES, seed, 4)}`,
        `${feature} ${String(pathIndex + 1).padStart(2, "0")}`,
    ];

    for (const candidate of candidates) {
        if (!usedNames.has(candidate)) {
            usedNames.add(candidate);
            return candidate;
        }
    }

    const fallback = `${adjective} ${feature} ${usedNames.size + 1}`;
    usedNames.add(fallback);
    return fallback;
}

function buildRegionsAndProvinces(
    islands: readonly GeneratedMapIsland[],
    assignments: readonly number[][],
    pathTagsByPiece: readonly string[][],
    topics: readonly LobbyMapTopic[],
) {
    const provinceCount = pathTagsByPiece.reduce((sum, tags) => sum + tags.length, 0);
    const normalizedTopics = normalizeTopics(topics, provinceCount);
    const regions: GeneratedMapRegion[] = normalizedTopics.map((topic, index) => ({
        regionId: `region-${String(index + 1).padStart(2, "0")}`,
        topicId: topic.id,
        name: topic.name,
        color: topic.color || REGION_FALLBACK_COLORS[index % REGION_FALLBACK_COLORS.length],
        provinceIds: [],
        provinceCount: 0,
        splitAcrossIslands: false,
    }));
    const islandIdsByRegion = regions.map(() => new Set<string>());
    const provinces: GeneratedMapProvince[] = [];
    const usedProvinceNames = new Set<string>();

    islands.forEach((island, pieceIndex) => {
        pathTagsByPiece[pieceIndex]?.forEach((_tag, pathIndex) => {
            const regionIndex = assignments[pieceIndex]?.[pathIndex] ?? 0;
            const region = regions[regionIndex] ?? regions[0];
            const provinceId = createProvinceId(island.islandId, pathIndex);
            provinces.push({
                provinceId,
                name: createProvinceName({
                    islandId: island.islandId,
                    pathIndex,
                    region,
                    usedNames: usedProvinceNames,
                }),
                islandId: island.islandId,
                pathIndex,
                regionId: region.regionId,
            });
            region.provinceIds.push(provinceId);
            region.provinceCount += 1;
            islandIdsByRegion[regionIndex]?.add(island.islandId);
        });
    });

    regions.forEach((region, index) => {
        region.splitAcrossIslands = (islandIdsByRegion[index]?.size ?? 0) > 1;
    });

    return { provinces, regions, topics: normalizedTopics };
}

function buildMarkerGeometry({
    islands,
    pathTagsByPiece,
    provinces,
    texts,
}: {
    islands: readonly GeneratedMapIsland[];
    pathTagsByPiece: readonly string[][];
    provinces: readonly GeneratedMapProvince[];
    texts: readonly string[];
}) {
    const provincesByIslandPath = new Map(
        provinces.map((province) => [`${province.islandId}:${province.pathIndex}`, province]),
    );
    const markers: GeneratedMapMarker[] = [];

    islands.forEach((island, pieceIndex) => {
        const viewBox = parseViewBox(texts[pieceIndex] ?? "");
        const islandBaseScale = islandMarkerBaseScale(island, islands);
        const rawMarkers = (pathTagsByPiece[pieceIndex] ?? [])
            .map((pathTag, pathIndex) => {
                const province = provincesByIslandPath.get(`${island.islandId}:${pathIndex}`);
                if (!province) return null;
                const centroid = pathCentroid(pathTag, pathIndex);
                return {
                    provinceId: province.provinceId,
                    islandId: island.islandId,
                    left: round2(clamp(((centroid.x - viewBox.x) / viewBox.width) * 100, 4, 96)),
                    top: round2(clamp(((centroid.y - viewBox.y) / viewBox.height) * 100, 4, 96)),
                    scale: 1,
                } satisfies GeneratedMapMarker;
            })
            .filter((marker): marker is GeneratedMapMarker => marker !== null);

        rawMarkers.forEach((marker) => {
            const distances = rawMarkers
                .filter((other) => other.provinceId !== marker.provinceId)
                .map((other) => Math.hypot(marker.left - other.left, marker.top - other.top))
                .sort((a, b) => a - b);
            const nearbyCount = distances.filter((distance) => distance < 9).length;
            const nearest = distances[0] ?? 12;
            const densityPenalty = Math.min(0.28, nearbyCount * 0.045);
            const nearestPenalty = nearest < 4.5 ? (4.5 - nearest) * 0.045 : 0;
            markers.push({
                ...marker,
                scale: round2(clamp(islandBaseScale - densityPenalty - nearestPenalty, 0.56, 1.16)),
            });
        });
    });

    const roads = islands.flatMap((island) =>
        createIslandRoads(
            markers.filter((marker) => marker.islandId === island.islandId),
            island.islandId,
        ),
    );

    return { markers, roads };
}

async function assignRegions(
    islands: readonly GeneratedMapIsland[],
    topics: readonly LobbyMapTopic[],
) {
    const texts = await Promise.all(islands.map((island) => fetchSvgText(island.svgPath)));
    const layoutPieces = islands.map(islandToLayout);
    const { assignments, pathTagsByPiece, totalProvinces } = createBalancedRegionAssignments(texts, layoutPieces, topics.length);
    const regionData = buildRegionsAndProvinces(islands, assignments, pathTagsByPiece, topics);
    const geometry = buildMarkerGeometry({
        islands,
        pathTagsByPiece,
        provinces: regionData.provinces,
        texts,
    });
    return {
        ...regionData,
        ...geometry,
        provinceCount: totalProvinces,
    };
}

export async function createGeneratedMapDraft({
    size,
    topics,
}: {
    size: GeneratedMapSize;
    topics: readonly LobbyMapTopic[];
}): Promise<GeneratedMapDraft> {
    const sizePlan = createSizePlan(size);
    const layout = createBestLayout(sizePlan, size);
    const islands = layout.map(layoutToIsland);
    const seaSprites = createSeaSprites(layout, size);
    const assigned = await assignRegions(islands, topics);

    return {
        schemaVersion: 1,
        generatorVersion: GENERATED_MAP_VERSION,
        id: `generated-${Date.now()}-${Math.round(Math.random() * 100000)}`,
        createdAt: new Date().toISOString(),
        size,
        regionCount: assigned.regions.length,
        provinceCount: assigned.provinceCount,
        seaBaseSrc: "map-test/sea-sprite.webp",
        topics: assigned.topics,
        islands,
        seaSprites,
        provinces: assigned.provinces,
        regions: assigned.regions,
        markers: assigned.markers,
        roads: assigned.roads,
    };
}

export async function reassignGeneratedMapRegions(
    draft: GeneratedMapDraft,
    topics: readonly LobbyMapTopic[],
): Promise<GeneratedMapDraft> {
    const assigned = await assignRegions(draft.islands, topics);
    return {
        ...draft,
        id: `${draft.id}-regions-${Date.now()}`,
        regionCount: assigned.regions.length,
        provinceCount: assigned.provinceCount,
        topics: assigned.topics,
        provinces: assigned.provinces,
        regions: assigned.regions,
        markers: assigned.markers,
        roads: assigned.roads,
    };
}

export function generatedRegionsAsLegend(draft: GeneratedMapDraft) {
    return draft.regions.map((region) => ({
        id: region.regionId,
        name: region.name,
        color: region.color,
        provinces: region.provinceIds,
    }));
}

export function provinceTotalFromIslands(islands: readonly Pick<GeneratedMapIsland, "size">[]) {
    return islands.reduce((sum, island) => sum + PIECE_PROVINCES[island.size], 0);
}
