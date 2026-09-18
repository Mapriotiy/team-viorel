import { Minus, Plus, RotateCcw } from "lucide-react";
import {
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type PointerEvent,
} from "react";
import { MAP_ASPECT_RATIO, mapAssetUrl } from "./assets";
import { mapColors } from "./mapColors";
import type { GeneratedMapDraft, GeneratedMapIsland, GeneratedMapMarker, GeneratedMapRoad } from "./types";

type GeneratedMapRendererProps = {
    draft: GeneratedMapDraft;
    captured?: Map<string, string>;
    highlightedProvinces?: string[] | null;
    bursts?: Map<string, string>;
    fortified?: Set<string>;
    onSelect?: (id: string, pos: { x: number; y: number }) => void;
    className?: string;
    showBack?: boolean;
    showFill?: boolean;
    overlayOpacity?: number;
    strokeWidth?: number;
    zoomable?: boolean;
    minZoom?: number;
    maxZoom?: number;
    initialZoom?: number;
    fitHeight?: boolean;
    interactive?: boolean;
    showMarkers?: boolean;
    showRoads?: boolean;
    showEffects?: boolean;
};

type ProvinceMarker = GeneratedMapMarker & {
    provinceName: string;
};

type DragState = {
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
};

type PointerPoint = {
    x: number;
    y: number;
};

type PinchState = {
    startDistance: number;
    startZoom: number;
    startPan: PointerPoint;
    startCenter: PointerPoint;
};

const ZOOM_STEP = 0.35;
const DEFAULT_NUMERIC_MAP_ASPECT_RATIO = 1321 / 900;
const svgTextCache = new Map<string, Promise<string>>();
const canvasImageCache = new Map<string, Promise<HTMLImageElement>>();
let canvasCastlePath: Path2D | null = null;

function loadSvgText(path: string) {
    const src = mapAssetUrl(path);
    const cached = svgTextCache.get(src);
    if (cached) return cached;

    const promise = fetch(src).then((response) => {
        if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
        return response.text();
    });
    svgTextCache.set(src, promise);
    return promise;
}

function loadCanvasImage(path: string) {
    const src = mapAssetUrl(path);
    const cached = canvasImageCache.get(src);
    if (cached) return cached;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`${path}: failed to load image`));
        image.src = src;
    });
    canvasImageCache.set(src, promise);
    return promise;
}

function getCanvasCastlePath() {
    if (!canvasCastlePath) {
        canvasCastlePath = new Path2D(
            "M11,4H4C3.4477,4,3,3.5523,3,3V0.5C3,0.2239,3.2239,0,3.5,0S4,0.2239,4,0.5V2h1V1c0-0.5523,0.4477-1,1-1s1,0.4477,1,1v1h1V1c0-0.5523,0.4477-1,1-1s1,0.4477,1,1v1h1V0.5C11,0.2239,11.2239,0,11.5,0S12,0.2239,12,0.5V3C12,3.5523,11.5523,4,11,4z M14,14.5c0,0.2761-0.2239,0.5-0.5,0.5h-12C1.2239,15,1,14.7761,1,14.5S1.2239,14,1.5,14H2c0.5523,0,1-0.4477,1-1c0,0,1-6,1-7c0-0.5523,0.4477-1,1-1h5c0.5523,0,1,0.4477,1,1c0,1,1,7,1,7c0,0.5523,0.4477,1,1,1h0.5c0.2723-0.0001,0.4946,0.2178,0.5,0.49V14.5z M9,10.5C9,9.6716,8.3284,9,7.5,9S6,9.6716,6,10.5V14h3V10.5z",
        );
    }
    return canvasCastlePath;
}

function clampZoom(value: number, minZoom: number, maxZoom: number) {
    return Math.max(minZoom, Math.min(maxZoom, value));
}

function pointerDistance(a: PointerPoint, b: PointerPoint) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerCenter(a: PointerPoint, b: PointerPoint): PointerPoint {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
    };
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

function stableHash(value: string) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }
    return hash;
}

function captureFillColor(color: string) {
    return mixHex(color, mapColors.capture.fillShade, mapColors.capture.fillWeight);
}

function captureStrokeColor(color: string) {
    return mixHex(color, mapColors.capture.strokeShade, mapColors.capture.strokeWeight);
}

function markerDisplayColor(color: string | null) {
    if (!color) return mapColors.marker.neutral;
    return mixHex(color, mapColors.marker.mixTarget, mapColors.marker.mixWeight);
}

function resolveCaptureColor(owner: string | undefined): string | null {
    if (!owner) return null;
    if (owner === "player") return mapColors.player;
    if (owner === "enemy") return mapColors.enemy;
    return owner;
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

function pathCentroidFromTag(pathTag: string, fallbackIndex: number) {
    const d = getAttr(pathTag, "d") ?? "";

    // A province can be several islands (multiple subpaths in one `d`).
    // Averaging every point pulls the marker into the sea between them, so
    // pick the centroid of the largest subpath (the main island).
    const subpaths = d.split(/[Mm]/).filter(Boolean);
    if (subpaths.length === 0) return { x: fallbackIndex, y: fallbackIndex };

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

function clampPercent(value: number) {
    return Math.max(4, Math.min(96, value));
}

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function parseAspectRatioValue(value: string) {
    const parts = value.split("/").map((part) => Number(part.trim()));
    const width = parts[0];
    const height = parts[1];
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return DEFAULT_NUMERIC_MAP_ASPECT_RATIO;
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

    return clampNumber(0.86 + (relativeSize - 1) * 0.34, 0.68, 1.16);
}

function roadKey(a: ProvinceMarker, b: ProvinceMarker) {
    return [a.provinceId, b.provinceId].sort().join("~");
}

function curvedRoadPath(a: ProvinceMarker, b: ProvinceMarker, seed: number) {
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / distance;
    const ny = dx / distance;
    const direction = seed % 2 === 0 ? 1 : -1;
    const bend = direction * clampNumber(distance * (0.05 + (seed % 7) * 0.006), 0.65, 3.1);
    const wobble = ((seed >> 4) % 5 - 2) * 0.12;

    const c1x = clampPercent(a.left + dx * 0.38 + nx * (bend + wobble));
    const c1y = clampPercent(a.top + dy * 0.36 + ny * (bend - wobble));
    const c2x = clampPercent(a.left + dx * 0.64 + nx * (bend - wobble));
    const c2y = clampPercent(a.top + dy * 0.66 + ny * (bend + wobble));

    return `M ${a.left.toFixed(2)} ${a.top.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(
        2,
    )}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${b.left.toFixed(2)} ${b.top.toFixed(2)}`;
}

function islandRoads(markers: ProvinceMarker[], islandId: string): GeneratedMapRoad[] {
    if (markers.length < 2) return [];

    const candidates = markers
        .flatMap((marker, index) =>
            markers.slice(index + 1).map((other) => ({
                a: marker,
                b: other,
                distance: Math.hypot(marker.left - other.left, marker.top - other.top),
                seed: stableHash(roadKey(marker, other)),
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
    const connect = (a: ProvinceMarker, b: ProvinceMarker) => {
        const rootA = find(a.provinceId);
        const rootB = find(b.provinceId);
        if (rootA === rootB) return false;
        parent.set(rootB, rootA);
        return true;
    };

    const roads = new Map<string, { a: ProvinceMarker; b: ProvinceMarker; distance: number; seed: number }>();

    for (const candidate of candidates) {
        if (!connect(candidate.a, candidate.b)) continue;
        roads.set(roadKey(candidate.a, candidate.b), candidate);
        if (roads.size >= markers.length - 1) break;
    }

    const connectedDistances = [...roads.values()].map((road) => road.distance);
    const averageRoadDistance =
        connectedDistances.reduce((total, distance) => total + distance, 0) / Math.max(1, connectedDistances.length);
    const extraMaxDistance = clampNumber(averageRoadDistance * 1.58, 14, 32);
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
            opacity: clampNumber(0.42 + (longestRoad - distance) / longestRoad * 0.26, 0.34, 0.68),
            dashOffset: seed % 11,
        }));
}

function islandMarkers({
    svgText,
    island,
    draft,
}: {
    svgText: string;
    island: GeneratedMapIsland;
    draft: GeneratedMapDraft;
}): ProvinceMarker[] {
    const viewBox = parseViewBox(svgText);
    const provinceByPath = new Map(
        draft.provinces
            .filter((province) => province.islandId === island.islandId)
            .map((province) => [province.pathIndex, province]),
    );

    const markers = [...svgText.matchAll(/<path\b[^>]*>/g)]
        .map((match) => match[0])
        .map((pathTag, pathIndex) => {
            const province = provinceByPath.get(pathIndex);
            if (!province) return null;
            const centroid = pathCentroidFromTag(pathTag, pathIndex);
            return {
                provinceId: province.provinceId,
                islandId: island.islandId,
                provinceName: province.name,
                left: clampPercent(((centroid.x - viewBox.x) / viewBox.width) * 100),
                top: clampPercent(((centroid.y - viewBox.y) / viewBox.height) * 100),
                scale: 1,
            } satisfies ProvinceMarker;
        })
        .filter((marker): marker is ProvinceMarker => marker !== null);

    const islandBaseScale = islandMarkerBaseScale(island, draft.islands);

    return markers.map((marker) => {
        const distances = markers
            .filter((other) => other.provinceId !== marker.provinceId)
            .map((other) => Math.hypot(marker.left - other.left, marker.top - other.top))
            .sort((a, b) => a - b);
        const nearbyCount = distances.filter((distance) => distance < 9).length;
        const nearest = distances[0] ?? 12;
        const densityPenalty = Math.min(0.28, nearbyCount * 0.045);
        const nearestPenalty = nearest < 4.5 ? (4.5 - nearest) * 0.045 : 0;

        return {
            ...marker,
            scale: clampNumber(islandBaseScale - densityPenalty - nearestPenalty, 0.56, 1.16),
        };
    });
}

type CanvasProvincePath = {
    provinceId: string;
    provinceName: string;
    regionColor: string;
    regionFill: string;
    regionStroke: string;
    path: Path2D;
};

type CanvasIslandLayer = {
    island: GeneratedMapIsland;
    viewBox: ReturnType<typeof parseViewBox>;
    maskPath: Path2D;
    provinces: CanvasProvincePath[];
};

function buildCanvasIslandLayer({
    svgText,
    island,
    draft,
}: {
    svgText: string;
    island: GeneratedMapIsland;
    draft: GeneratedMapDraft;
}): CanvasIslandLayer | null {
    if (typeof Path2D === "undefined") return null;

    const provinceByPath = new Map(
        draft.provinces
            .filter((province) => province.islandId === island.islandId)
            .map((province) => [province.pathIndex, province]),
    );
    const regionById = new Map(draft.regions.map((region) => [region.regionId, region]));
    const viewBox = parseViewBox(svgText);
    const maskPath = new Path2D();
    const provinces: CanvasProvincePath[] = [];

    let pathIndex = 0;
    for (const match of svgText.matchAll(/<path\b[^>]*>/g)) {
        const tag = match[0];
        const d = getAttr(tag, "d");
        const province = provinceByPath.get(pathIndex);
        const provinceId = province?.provinceId ?? `${island.islandId}-province-${String(pathIndex + 1).padStart(3, "0")}`;
        const provinceName = province?.name ?? provinceId;
        const region = province ? regionById.get(province.regionId) : null;
        const regionColor = region?.color ?? mapColors.regionFallback;
        pathIndex += 1;

        if (!d) continue;
        try {
            const path = new Path2D(d);
            maskPath.addPath(path);
            provinces.push({
                provinceId,
                provinceName,
                regionColor,
            regionFill: mixHex(regionColor, mapColors.province.fillShade, mapColors.province.fillWeight),
            regionStroke: mixHex(regionColor, mapColors.province.strokeShade, mapColors.province.strokeWeight),
                path,
            });
        } catch {
            // A malformed path should not take the whole map down.
        }
    }

    return { island, viewBox, maskPath, provinces };
}

function canvasIslandRect(island: GeneratedMapIsland, canvasWidth: number, canvasHeight: number) {
    const left = (island.left / 100) * canvasWidth;
    const top = (island.top / 100) * canvasHeight;
    const islandWidth = (island.width / 100) * canvasWidth;
    const islandHeight = islandWidth / parseAspectRatioValue(island.aspectRatio);
    return { left, top, width: islandWidth, height: islandHeight };
}

function withCanvasIslandTransform(
    ctx: CanvasRenderingContext2D,
    island: GeneratedMapIsland,
    canvasWidth: number,
    canvasHeight: number,
    callback: (rect: ReturnType<typeof canvasIslandRect>) => void,
) {
    const rect = canvasIslandRect(island, canvasWidth, canvasHeight);
    ctx.save();
    ctx.translate(rect.left + rect.width / 2, rect.top + rect.height / 2);
    ctx.rotate((island.rotation * Math.PI) / 180);
    ctx.translate(-rect.width / 2, -rect.height / 2);
    callback(rect);
    ctx.restore();
}

function clipCanvasIsland(ctx: CanvasRenderingContext2D, layer: CanvasIslandLayer, rect: ReturnType<typeof canvasIslandRect>) {
    const scaleX = rect.width / layer.viewBox.width;
    const scaleY = rect.height / layer.viewBox.height;
    ctx.scale(scaleX, scaleY);
    ctx.translate(-layer.viewBox.x, -layer.viewBox.y);
    ctx.clip(layer.maskPath);
}

function drawCanvasIslandBack({
    ctx,
    layer,
    rect,
    image,
}: {
    ctx: CanvasRenderingContext2D;
    layer: CanvasIslandLayer;
    rect: ReturnType<typeof canvasIslandRect>;
    image: HTMLImageElement | undefined;
}) {
    if (!image) return;
    ctx.save();
    clipCanvasIsland(ctx, layer, rect);
    ctx.drawImage(image, layer.viewBox.x, layer.viewBox.y, layer.viewBox.width, layer.viewBox.height);
    ctx.restore();
}

function drawCanvasProvinces({
    ctx,
    layer,
    rect,
    captured,
    highlightedProvinces,
    hoveredProvinceId,
    showFill,
    showEffects,
    overlayOpacity,
    strokeWidth,
}: {
    ctx: CanvasRenderingContext2D;
    layer: CanvasIslandLayer;
    rect: ReturnType<typeof canvasIslandRect>;
    captured: Map<string, string>;
    highlightedProvinces: string[] | null;
    hoveredProvinceId: string | null;
    showFill: boolean;
    showEffects: boolean;
    overlayOpacity: number;
    strokeWidth: number;
}) {
    const scaleX = rect.width / layer.viewBox.width;
    const scaleY = rect.height / layer.viewBox.height;
    const strokeScale = Math.max(0.001, (scaleX + scaleY) / 2);
    const highlighted = highlightedProvinces?.length ? new Set(highlightedProvinces) : null;

    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.translate(-layer.viewBox.x, -layer.viewBox.y);

    for (const province of layer.provinces) {
        const capturedColor = resolveCaptureColor(captured.get(province.provinceId));
        const isHighlighted = highlighted ? highlighted.has(province.provinceId) : true;
        const muted = highlighted && !isHighlighted && !capturedColor;
        const fill = capturedColor ? captureFillColor(capturedColor) : province.regionFill;
        const stroke = capturedColor ? captureStrokeColor(capturedColor) : province.regionStroke;
        const fillAlpha = capturedColor
            ? showFill ? mapColors.capture.fillAlpha : 0
            : muted
              ? 0.04
              : showFill ? mapColors.province.fillAlpha : 0;
        const strokeAlpha = capturedColor ? 0.9 : muted ? 0.16 : 0.72;
        const pathAlpha = capturedColor ? 0.98 : muted ? 0.24 : Math.min(overlayOpacity, 0.58);
        const lineWidth = (capturedColor ? 2.45 : strokeWidth) / strokeScale;

        if (fillAlpha > 0) {
            ctx.globalAlpha = fillAlpha * pathAlpha;
            ctx.fillStyle = fill;
            ctx.fill(province.path);
        }

        ctx.globalAlpha = strokeAlpha * pathAlpha;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (showEffects && capturedColor) {
            ctx.save();
            ctx.clip(province.path);
            ctx.shadowColor = stroke;
            ctx.shadowBlur = 4 / strokeScale;
            ctx.stroke(province.path);
            ctx.restore();
        } else {
            ctx.shadowBlur = 0;
            ctx.stroke(province.path);
        }
    }

    if (showEffects) {
        for (const province of layer.provinces) {
            const capturedColor = resolveCaptureColor(captured.get(province.provinceId));
            if (!capturedColor) continue;
            const stroke = captureStrokeColor(capturedColor);
            ctx.save();
            ctx.clip(province.path);
            ctx.globalCompositeOperation = "lighter";
            ctx.strokeStyle = stroke;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            ctx.globalAlpha = 0.16;
            ctx.lineWidth = 3.8 / strokeScale;
            ctx.shadowColor = stroke;
            ctx.shadowBlur = 10 / strokeScale;
            ctx.stroke(province.path);

            ctx.globalAlpha = 0.22;
            ctx.lineWidth = 2.2 / strokeScale;
            ctx.shadowBlur = 6 / strokeScale;
            ctx.stroke(province.path);

            ctx.restore();
        }
    }

    const hoveredProvince = hoveredProvinceId
        ? layer.provinces.find((province) => province.provinceId === hoveredProvinceId)
        : null;
    if (hoveredProvince) {
        const capturedColor = resolveCaptureColor(captured.get(hoveredProvince.provinceId));
        const fill = mixHex(capturedColor ? captureFillColor(capturedColor) : hoveredProvince.regionFill, mapColors.hover.fillTarget, mapColors.hover.fillWeight);
        const stroke = mixHex(capturedColor ? captureStrokeColor(capturedColor) : hoveredProvince.regionStroke, mapColors.hover.strokeTarget, mapColors.hover.strokeWeight);

        ctx.globalAlpha = 0.32;
        ctx.fillStyle = fill;
        ctx.fill(hoveredProvince.path);
        ctx.globalAlpha = 0.98;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = Math.max(strokeWidth + 0.85, 2) / strokeScale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = stroke;
        ctx.shadowBlur = 5 / strokeScale;
        ctx.stroke(hoveredProvince.path);
    }

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

function drawCanvasRoads({
    ctx,
    layer,
    rect,
    roads,
}: {
    ctx: CanvasRenderingContext2D;
    layer: CanvasIslandLayer;
    rect: ReturnType<typeof canvasIslandRect>;
    roads: GeneratedMapRoad[];
}) {
    if (!roads.length || typeof Path2D === "undefined") return;

    const currentTransform = ctx.getTransform();
    ctx.save();
    clipCanvasIsland(ctx, layer, rect);
    ctx.setTransform(currentTransform);
    ctx.strokeStyle = mapColors.marker.castle;
    ctx.lineWidth = 1.18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([4.4, 5.8]);
    ctx.shadowColor = "rgba(239, 163, 95, 0.34)";
    ctx.shadowBlur = 4;
    for (const road of roads) {
        const values = [...road.d.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
        if (values.length < 8 || values.some((value) => !Number.isFinite(value))) continue;
        ctx.globalAlpha = road.opacity;
        ctx.lineDashOffset = road.dashOffset;
        ctx.beginPath();
        ctx.moveTo((values[0] / 100) * rect.width, (values[1] / 100) * rect.height);
        ctx.bezierCurveTo(
            (values[2] / 100) * rect.width,
            (values[3] / 100) * rect.height,
            (values[4] / 100) * rect.width,
            (values[5] / 100) * rect.height,
            (values[6] / 100) * rect.width,
            (values[7] / 100) * rect.height,
        );
        ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
}

function drawCanvasCastle({
    ctx,
    x,
    y,
    size,
    rotation,
    color,
}: {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    size: number;
    rotation: number;
    color: string;
}) {
    const castlePath = getCanvasCastlePath();
    const scale = size / 15;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(scale, scale);
    ctx.translate(-7.5, -7.5);
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(12, 12, 12, 0.88)";
    ctx.lineWidth = 0.42;
    ctx.lineJoin = "round";
    ctx.stroke(castlePath);
    ctx.fill(castlePath);
    ctx.restore();
}

export function GeneratedMapRenderer({
    draft,
    captured = new Map(),
    highlightedProvinces = null,
    bursts = new Map(),
    fortified = new Set(),
    onSelect,
    className = "",
    showBack = true,
    showFill = true,
    overlayOpacity = 0.68,
    strokeWidth = 1.15,
    zoomable = true,
    minZoom = 1,
    maxZoom = 3,
    initialZoom = 1,
    fitHeight = false,
    interactive = true,
    showMarkers = true,
    showRoads = true,
    showEffects = true,
}: GeneratedMapRendererProps) {
    const [svgTexts, setSvgTexts] = useState<Record<string, string>>({});
    const [loadError, setLoadError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(() => clampZoom(initialZoom, minZoom, maxZoom));
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [imageVersion, setImageVersion] = useState(0);
    const [hoveredProvinceId, setHoveredProvinceId] = useState<string | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const layerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const canvasImagesRef = useRef(new Map<string, HTMLImageElement>());
    const hitCanvasRef = useRef<CanvasRenderingContext2D | null>(null);
    const viewRef = useRef({ zoom: clampZoom(initialZoom, minZoom, maxZoom), x: 0, y: 0 });
    const displayRef = useRef({ zoom: clampZoom(initialZoom, minZoom, maxZoom), x: 0, y: 0 });
    const animRef = useRef<number | null>(null);
    const inertiaRef = useRef<number | null>(null);
    const flingRef = useRef({ vx: 0, vy: 0, lastX: 0, lastY: 0, lastT: 0 });
    const dragRef = useRef<DragState | null>(null);
    const activePointersRef = useRef<Map<number, PointerPoint>>(new Map());
    const pinchRef = useRef<PinchState | null>(null);
    const wheelHandlerRef = useRef<(event: globalThis.WheelEvent) => void>(() => {});
    const commitTimerRef = useRef<number | null>(null);
    const movingTimerRef = useRef<number | null>(null);
    const rendererId = useId().replace(/:/g, "-");
    const effectiveZoomable = zoomable && interactive;
    const canSelectProvince = interactive && Boolean(onSelect);
    const canUseCanvas = typeof Path2D !== "undefined";

    // Content-based signature so that same-layout drafts (which the lobby
    // poll re-creates every few seconds) don't reset the view or refetch SVGs.
    const draftSignature = useMemo(
        () =>
            [
                draft.seaBaseSrc,
                draft.islands.map((i) => `${i.islandId}:${i.svgPath}`).join("|"),
                draft.provinces.map((p) => `${p.provinceId}:${p.islandId}:${p.regionId}`).join("|"),
                draft.seaSprites.map((s) => `${s.id}:${s.src}`).join("|"),
            ].join("~"),
        [draft],
    );

    useEffect(() => {
        let cancelled = false;
        setLoadError(null);
        setSvgTexts({});

        Promise.all(
            draft.islands.map(async (island) => {
                return [island.islandId, await loadSvgText(island.svgPath)] as const;
            }),
        )
            .then((entries) => {
                if (!cancelled) setSvgTexts(Object.fromEntries(entries));
            })
            .catch((error) => {
                if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load map SVG");
            });

        return () => {
            cancelled = true;
        };
    }, [draftSignature]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const updateSize = () => {
            const width = root.clientWidth;
            const height = root.clientHeight;
            setCanvasSize((current) =>
                Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
                    ? current
                    : { width, height },
            );
        };

        updateSize();
        const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
        observer?.observe(root);
        window.addEventListener("resize", updateSize);
        return () => {
            observer?.disconnect();
            window.removeEventListener("resize", updateSize);
        };
    }, []);

    const canvasImagePaths = useMemo(() => {
        const paths = new Set<string>();
        paths.add(draft.seaBaseSrc);
        for (const sprite of draft.seaSprites) paths.add(sprite.src);
        if (showBack) {
            for (const island of draft.islands) paths.add(island.backPath);
        }
        return [...paths];
    }, [draft.islands, draft.seaBaseSrc, draft.seaSprites, showBack]);

    const canvasImageKey = canvasImagePaths.join("|");

    useEffect(() => {
        if (!canUseCanvas) return;
        let cancelled = false;

        Promise.all(
            canvasImagePaths.map(async (path) => {
                const image = await loadCanvasImage(path);
                return [mapAssetUrl(path), image] as const;
            }),
        )
            .then((entries) => {
                if (cancelled) return;
                for (const [src, image] of entries) {
                    canvasImagesRef.current.set(src, image);
                }
                setImageVersion((version) => version + 1);
            })
            .catch((error) => {
                if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load map images");
            });

        return () => {
            cancelled = true;
        };
    }, [canUseCanvas, canvasImageKey]); // eslint-disable-line react-hooks/exhaustive-deps

    function applyView() {
        const layer = layerRef.current;
        if (!layer) return;
        const { zoom: z, x, y } = displayRef.current;
        layer.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    }

    function markMoving() {
        const root = rootRef.current;
        if (!root || !showEffects) return;
        root.classList.add("generated-map-moving");
        if (movingTimerRef.current !== null) window.clearTimeout(movingTimerRef.current);
        movingTimerRef.current = window.setTimeout(() => {
            movingTimerRef.current = null;
            root.classList.remove("generated-map-moving");
        }, 180);
    }

    // Smoothly glide displayRef toward viewRef every frame. Discrete wheel
    // notches just move the target; this loop makes the motion continuous.
    function startSmoothZoom() {
        if (animRef.current !== null) return;
        cancelInertia();
        const EASE = 0.22;
        const tick = () => {
            const target = viewRef.current;
            const display = displayRef.current;
            display.zoom += (target.zoom - display.zoom) * EASE;
            display.x += (target.x - display.x) * EASE;
            display.y += (target.y - display.y) * EASE;
            applyView();
            if (
                Math.abs(target.zoom - display.zoom) < 0.001 &&
                Math.abs(target.x - display.x) < 0.5 &&
                Math.abs(target.y - display.y) < 0.5
            ) {
                displayRef.current = { zoom: target.zoom, x: target.x, y: target.y };
                applyView();
                animRef.current = null;
                return;
            }
            animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);
    }

    function applyViewInstant() {
        if (animRef.current !== null) {
            cancelAnimationFrame(animRef.current);
            animRef.current = null;
        }
        cancelInertia();
        displayRef.current = { ...viewRef.current };
        applyView();
    }

    function cancelInertia() {
        if (inertiaRef.current !== null) {
            cancelAnimationFrame(inertiaRef.current);
            inertiaRef.current = null;
        }
        const fling = flingRef.current;
        fling.vx = 0;
        fling.vy = 0;
        fling.lastX = 0;
        fling.lastY = 0;
        fling.lastT = 0;
    }

    // Momentum after a drag: keep panning with the measured velocity while it
    // decays, so a flick feels natural instead of stopping dead.
    function startInertia() {
        if (inertiaRef.current !== null) return;
        const speed = Math.hypot(flingRef.current.vx, flingRef.current.vy);
        if (speed < 0.08) return;
        const DECAY = 0.94;
        const FRAME_MS = 16.7;
        const tick = () => {
            const fling = flingRef.current;
            const vx = fling.vx * DECAY;
            const vy = fling.vy * DECAY;
            fling.vx = vx;
            fling.vy = vy;
            if (Math.abs(vx) < 0.02 && Math.abs(vy) < 0.02) {
                inertiaRef.current = null;
                commitView();
                return;
            }
            viewRef.current.x += vx * FRAME_MS;
            viewRef.current.y += vy * FRAME_MS;
            displayRef.current.x = viewRef.current.x;
            displayRef.current.y = viewRef.current.y;
            markMoving();
            applyView();
            inertiaRef.current = requestAnimationFrame(tick);
        };
        inertiaRef.current = requestAnimationFrame(tick);
    }

    function commitView() {
        setZoom(viewRef.current.zoom);
    }

    function commitViewSoon() {
        if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = window.setTimeout(() => {
            commitTimerRef.current = null;
            commitView();
        }, 200);
    }

    useEffect(() => {
        return () => {
            if (movingTimerRef.current !== null) window.clearTimeout(movingTimerRef.current);
        };
    }, []);

    useEffect(() => {
        viewRef.current = { zoom: clampZoom(initialZoom, minZoom, maxZoom), x: 0, y: 0 };
        setZoom(viewRef.current.zoom);
        activePointersRef.current.clear();
        dragRef.current = null;
        pinchRef.current = null;
        applyViewInstant();
    }, [draftSignature, initialZoom, maxZoom, minZoom]); // eslint-disable-line react-hooks/exhaustive-deps

    const provinceNameById = useMemo(
        () => new Map(draft.provinces.map((province) => [province.provinceId, province.name])),
        [draft.provinces],
    );

    const hasPrecomputedRoads = Boolean(draft.roads?.length);
    const needsMarkerGeometry = showMarkers || (showRoads && !hasPrecomputedRoads);

    const markersByIsland = useMemo(() => {
        const map = new Map<string, ProvinceMarker[]>();
        if (!needsMarkerGeometry) return map;
        if (draft.markers?.length) {
            for (const marker of draft.markers) {
                const entry: ProvinceMarker = {
                    ...marker,
                    provinceName: provinceNameById.get(marker.provinceId) ?? marker.provinceId,
                };
                map.set(marker.islandId, [...(map.get(marker.islandId) ?? []), entry]);
            }
            return map;
        }

        for (const island of draft.islands) {
            const svgText = svgTexts[island.islandId];
            if (!svgText) continue;
            map.set(island.islandId, islandMarkers({ svgText, island, draft }));
        }
        return map;
    }, [draft, needsMarkerGeometry, provinceNameById, svgTexts]);

    const roadsByIsland = useMemo(() => {
        const map = new Map<string, GeneratedMapRoad[]>();
        if (!showRoads) return map;
        if (draft.roads?.length) {
            for (const road of draft.roads) {
                map.set(road.islandId, [...(map.get(road.islandId) ?? []), road]);
            }
            return map;
        }

        for (const island of draft.islands) {
            map.set(island.islandId, islandRoads(markersByIsland.get(island.islandId) ?? [], island.islandId));
        }
        return map;
    }, [draft.islands, draft.roads, markersByIsland, showRoads]);

    const canvasLayers = useMemo(() => {
        if (!canUseCanvas) return [];
        return draft.islands
            .map((island) => {
                const svgText = svgTexts[island.islandId];
                if (!svgText) return null;
                return buildCanvasIslandLayer({ svgText, island, draft });
            })
            .filter((layer): layer is CanvasIslandLayer => layer !== null);
    }, [canUseCanvas, draft, svgTexts]);

    const sortedCanvasLayers = useMemo(
        () => [...canvasLayers].sort((a, b) => a.island.zIndex - b.island.zIndex),
        [canvasLayers],
    );

    const useCanvasRenderer = canUseCanvas;

    useEffect(() => {
        if (!useCanvasRenderer) return;
        const canvas = canvasRef.current;
        if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.max(1, Math.round(canvasSize.width * dpr));
        const targetHeight = Math.max(1, Math.round(canvasSize.height * dpr));
        if (canvas.width !== targetWidth) canvas.width = targetWidth;
        if (canvas.height !== targetHeight) canvas.height = targetHeight;
        canvas.style.width = `${canvasSize.width}px`;
        canvas.style.height = `${canvasSize.height}px`;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "medium";

        const images = canvasImagesRef.current;
        const seaImage = images.get(mapAssetUrl(draft.seaBaseSrc));
        if (seaImage) {
            ctx.drawImage(seaImage, 0, 0, canvasSize.width, canvasSize.height);
        } else {
            ctx.fillStyle = mapColors.sea.fallback;
            ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
        }

        for (const sprite of draft.seaSprites) {
            const image = images.get(mapAssetUrl(sprite.src));
            if (!image) continue;
            const spriteWidth = (sprite.width / 100) * canvasSize.width;
            const spriteHeight =
                spriteWidth * ((image.naturalHeight || image.height || 1) / Math.max(1, image.naturalWidth || image.width || 1));
            ctx.save();
            ctx.globalAlpha = sprite.opacity;
            ctx.drawImage(
                image,
                (sprite.left / 100) * canvasSize.width,
                (sprite.top / 100) * canvasSize.height,
                spriteWidth,
                spriteHeight,
            );
            ctx.restore();
        }

        for (const layer of sortedCanvasLayers) {
            withCanvasIslandTransform(ctx, layer.island, canvasSize.width, canvasSize.height, (rect) => {
                if (showBack) {
                    drawCanvasIslandBack({
                        ctx,
                        layer,
                        rect,
                        image: images.get(mapAssetUrl(layer.island.backPath)),
                    });
                }
                drawCanvasProvinces({
                    ctx,
                    layer,
                    rect,
                    captured,
                    highlightedProvinces,
                    hoveredProvinceId,
                    showFill,
                    showEffects,
                    overlayOpacity,
                    strokeWidth,
                });
                if (showRoads) {
                    drawCanvasRoads({
                        ctx,
                        layer,
                        rect,
                        roads: roadsByIsland.get(layer.island.islandId) ?? [],
                    });
                }
                if (showMarkers) {
                    const markerBaseSize = clampNumber(canvasSize.width * 0.016, 11, 18);
                    for (const marker of markersByIsland.get(layer.island.islandId) ?? []) {
                        const markerColor = resolveCaptureColor(captured.get(marker.provinceId));
                        drawCanvasCastle({
                            ctx,
                            x: (marker.left / 100) * rect.width,
                            y: (marker.top / 100) * rect.height,
                            size: markerBaseSize * marker.scale,
                            rotation: -(layer.island.rotation * Math.PI) / 180,
                            color: markerDisplayColor(markerColor),
                        });
                    }
                }
            });
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
    }, [
        captured,
        canvasSize.height,
        canvasSize.width,
        draft.seaBaseSrc,
        draft.seaSprites,
        highlightedProvinces,
        hoveredProvinceId,
        imageVersion,
        markersByIsland,
        overlayOpacity,
        roadsByIsland,
        showBack,
        showFill,
        showEffects,
        showMarkers,
        showRoads,
        sortedCanvasLayers,
        strokeWidth,
        useCanvasRenderer,
    ]);

    function updateZoom(nextZoom: number) {
        const clamped = clampZoom(nextZoom, minZoom, maxZoom);
        viewRef.current = {
            zoom: clamped,
            x: clamped === minZoom ? 0 : viewRef.current.x,
            y: clamped === minZoom ? 0 : viewRef.current.y,
        };
        markMoving();
        startSmoothZoom();
        commitView();
    }

    function resetView() {
        viewRef.current = { zoom: clampZoom(initialZoom, minZoom, maxZoom), x: 0, y: 0 };
        markMoving();
        startSmoothZoom();
        commitView();
    }

    useEffect(() => {
        wheelHandlerRef.current = (event: globalThis.WheelEvent) => {
            if (!effectiveZoomable) return;
            event.preventDefault();
            // Normalize line/page deltas to pixels and zoom continuously so
            // both mouse notches and trackpad inertia feel smooth.
            const delta =
                event.deltaMode === 1
                    ? event.deltaY * 16
                    : event.deltaMode === 2
                      ? event.deltaY * window.innerHeight
                      : event.deltaY;
            const factor = Math.exp(-delta * 0.0016);
            const zoomOld = viewRef.current.zoom;
            const nextZoom = clampZoom(zoomOld * factor, minZoom, maxZoom);

            if (nextZoom === minZoom) {
                viewRef.current = { zoom: minZoom, x: 0, y: 0 };
            } else {
                // Keep the point under the cursor anchored while scaling. The
                // layer's transform-origin is its center, so the anchor formula
                // is pan' = r*pan + (1-r)*(cursor - origin).
                const rect = rootRef.current?.getBoundingClientRect();
                if (rect) {
                    const cx = event.clientX - rect.left;
                    const cy = event.clientY - rect.top;
                    const originX = rect.width / 2;
                    const originY = rect.height / 2;
                    const r = nextZoom / zoomOld;
                    viewRef.current = {
                        zoom: nextZoom,
                        x: r * viewRef.current.x + (1 - r) * (cx - originX),
                        y: r * viewRef.current.y + (1 - r) * (cy - originY),
                    };
                } else {
                    viewRef.current = { ...viewRef.current, zoom: nextZoom };
                }
            }
            markMoving();
            startSmoothZoom();
            commitViewSoon();
        };
    });

    useEffect(() => {
        const root = rootRef.current;
        if (!root || !effectiveZoomable) return;
        const onWheel = (event: globalThis.WheelEvent) => wheelHandlerRef.current(event);
        root.addEventListener("wheel", onWheel, { passive: false });
        return () => root.removeEventListener("wheel", onWheel);
    }, [effectiveZoomable]);

    // Province selection rides on the native `click` event: the browser already
    // distinguishes a tap from a drag (movement suppresses click), so it works
    // reliably on phones without fighting pointer jitter.
    const clickHandlerRef = useRef<(event: MouseEvent) => void>(() => {});
    clickHandlerRef.current = (event: MouseEvent) => {
        if (!canSelectProvince) return;
        if ((event.target as Element).closest("button")) return;
        selectProvinceAt(event);
    };

    useEffect(() => {
        const root = rootRef.current;
        if (!root || !canSelectProvince) return;
        const onClick = (event: MouseEvent) => clickHandlerRef.current(event);
        root.addEventListener("click", onClick);
        return () => root.removeEventListener("click", onClick);
    }, [canSelectProvince]);

    function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
        if (!effectiveZoomable || event.button !== 0) return;
        if ((event.target as Element).closest("button")) return;
        setHoveredProvinceId(null);
        applyViewInstant();
        activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

        const activePoints = [...activePointersRef.current.values()];
        if (activePoints.length >= 2) {
            event.currentTarget.setPointerCapture(event.pointerId);
            const [a, b] = activePoints;
            pinchRef.current = {
                startDistance: Math.max(1, pointerDistance(a, b)),
                startZoom: viewRef.current.zoom,
                startPan: { x: viewRef.current.x, y: viewRef.current.y },
                startCenter: pointerCenter(a, b),
            };
            dragRef.current = null;
            return;
        }

        if (viewRef.current.zoom <= minZoom) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: viewRef.current.x,
            originY: viewRef.current.y,
            moved: false,
        };
    }

    function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
        if (activePointersRef.current.has(event.pointerId)) {
            activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }

        const pinch = pinchRef.current;
        if (pinch && activePointersRef.current.size >= 2) {
            const [a, b] = [...activePointersRef.current.values()];
            const nextZoom = clampZoom(
                pinch.startZoom * (pointerDistance(a, b) / pinch.startDistance),
                minZoom,
                maxZoom,
            );
            const center = pointerCenter(a, b);
            const nextView =
                nextZoom === minZoom
                    ? { zoom: minZoom, x: 0, y: 0 }
                    : {
                          zoom: nextZoom,
                          x: pinch.startPan.x + center.x - pinch.startCenter.x,
                          y: pinch.startPan.y + center.y - pinch.startCenter.y,
                      };
            viewRef.current = nextView;
            displayRef.current = nextView;
            markMoving();
            applyView();
            return;
        }

        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            if (event.pointerType === "mouse" && canSelectProvince) {
                const nextHovered = findCanvasProvinceAt(event);
                setHoveredProvinceId((current) => (current === nextHovered ? current : nextHovered));
            }
            return;
        }
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        // Touch taps carry more finger jitter than mouse clicks; keep them taps
        // so province selection works reliably on phones.
        const tapThreshold = event.pointerType === 'touch' ? 10 : 3;
        if (Math.abs(dx) + Math.abs(dy) > tapThreshold) drag.moved = true;
        viewRef.current.x = drag.originX + dx;
        viewRef.current.y = drag.originY + dy;
        displayRef.current.x = viewRef.current.x;
        displayRef.current.y = viewRef.current.y;
        markMoving();
        applyView();

        // Track a smoothed drag velocity (px per ms) for the release fling.
        const now = performance.now();
        const fling = flingRef.current;
        const dt = now - fling.lastT;
        if (dt > 0) {
            const instVx = (event.clientX - fling.lastX) / dt;
            const instVy = (event.clientY - fling.lastY) / dt;
            fling.vx = dt > 64 ? instVx : fling.vx * 0.85 + instVx * 0.15;
            fling.vy = dt > 64 ? instVy : fling.vy * 0.85 + instVy * 0.15;
        }
        fling.lastX = event.clientX;
        fling.lastY = event.clientY;
        fling.lastT = now;
    }

    function handlePointerLeave() {
        setHoveredProvinceId(null);
    }

    function findProvincePath(event: { target: EventTarget | null; clientX: number; clientY: number }): SVGPathElement | null {
        const directPath = (event.target as Element | null)?.closest?.<SVGPathElement>(".generated-map-province") ?? null;
        if (directPath) return directPath;

        for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
            const path = element.closest?.(".generated-map-province");
            if (path instanceof SVGPathElement) return path;
        }
        return null;
    }

    function findCanvasProvinceAt(event: { clientX: number; clientY: number }) {
        if (!useCanvasRenderer || canvasSize.width <= 0 || canvasSize.height <= 0) return null;
        const canvas = canvasRef.current;
        const rect = canvas?.getBoundingClientRect();
        if (!canvas || !rect || rect.width <= 0 || rect.height <= 0) return null;

        let hitCtx = hitCanvasRef.current;
        if (!hitCtx) {
            hitCtx = document.createElement("canvas").getContext("2d");
            if (!hitCtx) return null;
            hitCanvasRef.current = hitCtx;
        }

        const canvasX = ((event.clientX - rect.left) / rect.width) * canvasSize.width;
        const canvasY = ((event.clientY - rect.top) / rect.height) * canvasSize.height;

        for (const layer of [...sortedCanvasLayers].reverse()) {
            const islandRect = canvasIslandRect(layer.island, canvasSize.width, canvasSize.height);
            const centerX = islandRect.left + islandRect.width / 2;
            const centerY = islandRect.top + islandRect.height / 2;
            const dx = canvasX - centerX;
            const dy = canvasY - centerY;
            const angle = -(layer.island.rotation * Math.PI) / 180;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const localX = dx * cos - dy * sin + islandRect.width / 2;
            const localY = dx * sin + dy * cos + islandRect.height / 2;

            if (localX < 0 || localY < 0 || localX > islandRect.width || localY > islandRect.height) continue;

            const svgX = layer.viewBox.x + (localX / islandRect.width) * layer.viewBox.width;
            const svgY = layer.viewBox.y + (localY / islandRect.height) * layer.viewBox.height;
            for (const province of layer.provinces) {
                if (hitCtx.isPointInPath(province.path, svgX, svgY)) return province.provinceId;
            }
        }

        return null;
    }

    function selectProvinceAt(event: { target: EventTarget | null; clientX: number; clientY: number }) {
        if (!onSelect) return;
        const canvasProvinceId = findCanvasProvinceAt(event);
        if (canvasProvinceId) {
            onSelect(canvasProvinceId, { x: event.clientX, y: event.clientY });
            return;
        }
        const path = findProvincePath(event);
        if (!path) return;
        const provinceId = path.getAttribute("data-province-id") || path.id;
        const rect = path.getBoundingClientRect();
        onSelect(provinceId, {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        });
    }

    function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
        const releasePointer = () => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
        };

        activePointersRef.current.delete(event.pointerId);
        if (pinchRef.current) {
            if (activePointersRef.current.size < 2) {
                pinchRef.current = null;
                commitView();
            }
            setHoveredProvinceId(null);
            releasePointer();
            return;
        }

        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
            releasePointer();
            return;
        }
        dragRef.current = null;
        commitView();
        startInertia();
        if (drag.moved) setHoveredProvinceId(null);
        releasePointer();
    }

    const mapLayerStyle: CSSProperties = {
        willChange: effectiveZoomable ? "transform" : undefined,
        cursor: hoveredProvinceId ? "pointer" : effectiveZoomable ? (zoom > minZoom ? "grab" : "zoom-in") : undefined,
    };
    const rootStyle: CSSProperties = fitHeight
        ? { aspectRatio: MAP_ASPECT_RATIO, height: "100%", minWidth: "100%" }
        : { aspectRatio: MAP_ASPECT_RATIO };

    return (
        <div
            className={`generated-map-root relative overflow-hidden rounded-lg border border-white/10 shadow-2xl ${
                fitHeight ? "inline-block align-top" : "w-full"
            } ${
                effectiveZoomable ? "touch-none select-none" : ""
            } ${
                showEffects ? "" : "generated-map-lite"
            } ${
                highlightedProvinces?.length ? "generated-map-has-highlight" : ""
            } ${className}`}
            style={rootStyle}
            data-generated-map-id={rendererId}
            ref={rootRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <GeneratedMapStyles />
            {effectiveZoomable ? (
                <div className="absolute right-2 top-2 z-20 hidden items-center gap-1 rounded-md border border-white/10 bg-[#1b1b1b]/85 p-1 shadow-lg backdrop-blur sm:flex">
                    <button
                        type="button"
                        onClick={() => updateZoom(zoom - ZOOM_STEP)}
                        disabled={zoom <= minZoom}
                        title="Zoom out"
                        aria-label="Zoom out"
                        className="grid h-8 w-8 place-items-center rounded bg-[#2a2a2a] text-[#d7d7d7] transition hover:text-white disabled:cursor-not-allowed disabled:text-[#666]"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={() => updateZoom(zoom + ZOOM_STEP)}
                        disabled={zoom >= maxZoom}
                        title="Zoom in"
                        aria-label="Zoom in"
                        className="grid h-8 w-8 place-items-center rounded bg-[#2a2a2a] text-[#d7d7d7] transition hover:text-white disabled:cursor-not-allowed disabled:text-[#666]"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={resetView}
                        title="Reset zoom"
                        aria-label="Reset zoom"
                        className="grid h-8 w-8 place-items-center rounded bg-[#2a2a2a] text-[#d7d7d7] transition hover:text-white"
                    >
                        <RotateCcw size={15} />
                    </button>
                </div>
            ) : null}
            <div className="absolute inset-0" style={mapLayerStyle} ref={layerRef}>
                        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
                        {showEffects && (bursts.size > 0 || fortified.size > 0)
                            ? draft.islands.map((island) => (
                                  <div
                                      key={`${island.islandId}-effects`}
                                      className="pointer-events-none absolute"
                                      style={{
                                          left: `${island.left}%`,
                                          top: `${island.top}%`,
                                          width: `${island.width}%`,
                                          aspectRatio: island.aspectRatio,
                                          zIndex: island.zIndex + 10,
                                          transform: `rotate(${island.rotation}deg)`,
                                          transformOrigin: "center",
                                      }}
                                  >
                                      <div className="pointer-events-none absolute inset-0 z-[6]">
                                          {(markersByIsland.get(island.islandId) ?? []).map((marker) => {
                                              const hasBurst = bursts.has(marker.provinceId);
                                              const hasFortified = fortified.has(marker.provinceId);
                                              if (!hasBurst && !hasFortified) return null;
                                              const markerColor = resolveCaptureColor(captured.get(marker.provinceId));
                                              return (
                                                  <span
                                                      key={marker.provinceId}
                                                      className="generated-map-marker"
                                                      data-captured={markerColor ? "true" : "false"}
                                                      title={marker.provinceName}
                                                      style={{
                                                          left: `${marker.left}%`,
                                                          top: `${marker.top}%`,
                                                          "--generated-marker-color": markerDisplayColor(markerColor),
                                                          "--generated-marker-counter-rotation": `${-island.rotation}deg`,
                                                          "--generated-marker-scale": marker.scale,
                                                      } as CSSProperties}
                                                  >
                                                      {hasBurst ? (
                                                          <span
                                                              className="generated-map-capture-burst"
                                                              style={
                                                                  {
                                                                      "--burst-color":
                                                                          bursts.get(marker.provinceId) ?? markerColor ?? "#ffffff",
                                                                  } as CSSProperties
                                                              }
                                                          />
                                                      ) : null}
                                                      {hasFortified ? (
                                                          <span className="generated-map-fortify" aria-label="fortified">
                                                              <svg
                                                                  viewBox="0 0 24 24"
                                                                  width="100%"
                                                                  height="100%"
                                                                  fill="none"
                                                                  aria-hidden="true"
                                                              >
                                                                  <path
                                                                      d="M11.302 21.6149C11.5234 21.744 11.6341 21.8086 11.7903 21.8421C11.9116 21.8681 12.0884 21.8681 12.2097 21.8421C12.3659 21.8086 12.4766 21.744 12.698 21.6149C14.646 20.4784 20 16.9084 20 12V6.6C20 6.04207 20 5.7631 19.8926 5.55048C19.7974 5.36198 19.6487 5.21152 19.4613 5.11409C19.25 5.00419 18.9663 5.00084 18.3988 4.99413C15.4272 4.95899 13.7136 4.71361 12 3C10.2864 4.71361 8.57279 4.95899 5.6012 4.99413C5.03373 5.00084 4.74999 5.00419 4.53865 5.11409C4.35129 5.21152 4.20259 5.36198 4.10739 5.55048C4 5.7631 4 6.04207 4 6.6V12C4 16.9084 9.35396 20.4784 11.302 21.6149Z"
                                                                      fill="currentColor"
                                                                  />
                                                              </svg>
                                                          </span>
                                                      ) : null}
                                                  </span>
                                              );
                                          })}
                                      </div>
                                  </div>
                              ))
                            : null}
            </div>
            {loadError ? (
                <div className="absolute inset-x-4 top-4 rounded-md border border-red-500/30 bg-red-950/70 px-3 py-2 text-sm text-red-200">
                    {loadError}
                </div>
            ) : null}
        </div>
    );
}

function GeneratedMapStyles() {
    return (
        <style>
            {`
                .generated-map-svg {
                    display: block;
                    width: 100%;
                    height: 100%;
                    overflow: visible;
                    filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.34));
                }

                .generated-map-back {
                    filter: saturate(0.96) brightness(1.04) contrast(0.98);
                }

                .generated-map-svg .generated-map-province {
                    cursor: pointer;
                    fill: var(--generated-map-region-color) !important;
                    fill-opacity: var(--generated-map-fill-opacity) !important;
                    opacity: var(--generated-map-layer-opacity) !important;
                    stroke: var(--generated-map-region-stroke-color) !important;
                    stroke-opacity: 0.72 !important;
                    stroke-width: var(--generated-map-stroke-width) !important;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                    vector-effect: non-scaling-stroke;
                    pointer-events: all;
                    transition: fill-opacity 120ms ease, opacity 120ms ease, stroke-opacity 120ms ease, stroke-width 120ms ease;
                }

                .generated-map-svg .generated-map-province[data-muted="true"] {
                    fill-opacity: 0.04 !important;
                    opacity: 0.24 !important;
                    stroke-opacity: 0.16 !important;
                }

                .generated-map-root.generated-map-has-highlight .generated-map-svg .generated-map-province {
                    fill-opacity: 0.04 !important;
                    opacity: 0.24 !important;
                    stroke-opacity: 0.16 !important;
                }

                .generated-map-svg .generated-map-province[data-captured="true"] {
                    fill: var(--generated-map-capture-fill-color) !important;
                    fill-opacity: var(--generated-map-capture-fill-opacity) !important;
                    opacity: 0.9 !important;
                    stroke: var(--generated-map-capture-stroke-color) !important;
                    stroke-opacity: 0.9 !important;
                    stroke-width: 2.45 !important;
                    filter: none !important;
                }

                .generated-map-svg .generated-map-province:hover {
                    fill-opacity: 0.22 !important;
                    opacity: 1 !important;
                    stroke-opacity: 0.82 !important;
                    stroke-width: calc(var(--generated-map-stroke-width) + 0.8) !important;
                    filter: drop-shadow(0 0 5px var(--generated-map-region-stroke-color));
                }

                .generated-map-root.generated-map-lite,
                .generated-map-root.generated-map-moving {
                    box-shadow: none;
                }

                .generated-map-root.generated-map-lite .generated-map-svg,
                .generated-map-root.generated-map-moving .generated-map-svg,
                .generated-map-root.generated-map-lite .generated-map-back,
                .generated-map-root.generated-map-moving .generated-map-back,
                .generated-map-root.generated-map-lite .generated-map-svg .generated-map-province,
                .generated-map-root.generated-map-moving .generated-map-svg .generated-map-province {
                    filter: none !important;
                }

                .generated-map-road-layer {
                    pointer-events: none;
                    overflow: visible;
                    opacity: 0.98;
                    filter:
                        drop-shadow(0 1px 2px rgba(0, 0, 0, 0.46))
                        drop-shadow(0 0 5px rgba(216, 137, 73, 0.28));
                }

                .generated-map-road {
                    fill: none;
                    stroke: #efa35f;
                    stroke-width: 1.18px;
                    stroke-linecap: round;
                    stroke-linejoin: round;
                    stroke-dasharray: 3.4 4.6;
                    stroke-dashoffset: var(--generated-road-dash-offset);
                    vector-effect: non-scaling-stroke;
                    opacity: var(--generated-road-opacity);
                    filter:
                        drop-shadow(0 0 3px rgba(239, 163, 95, 0.42))
                        drop-shadow(0 0 8px rgba(239, 163, 95, 0.2));
                }

                .generated-map-root.generated-map-lite .generated-map-road-layer,
                .generated-map-root.generated-map-moving .generated-map-road-layer,
                .generated-map-root.generated-map-lite .generated-map-road,
                .generated-map-root.generated-map-moving .generated-map-road {
                    filter: none !important;
                }

                .generated-map-root.generated-map-moving .generated-map-road {
                    opacity: 0.34;
                }

                .generated-map-marker {
                    position: absolute;
                    display: grid;
                    width: clamp(0.72rem, 1vw, 1.08rem);
                    aspect-ratio: 1;
                    place-items: center;
                    transform: translate(-50%, -50%);
                    color: var(--generated-marker-color);
                }

                .generated-map-marker-shell {
                    position: relative;
                    display: grid;
                    width: 100%;
                    height: 100%;
                    place-items: center;
                    color: currentColor;
                    transform: rotate(var(--generated-marker-counter-rotation, 0deg)) scale(var(--generated-marker-scale, 1));
                    transform-origin: center;
                }

                .generated-map-marker[data-captured="false"] {
                    opacity: 0.72;
                }

                .generated-map-marker[data-captured="false"] .generated-map-marker-shell {
                    color: ${mapColors.marker.neutral};
                    opacity: 0.82;
                }

                .generated-map-marker[data-captured="true"] .generated-map-marker-shell {
                    opacity: 0.98;
                }

                .generated-map-root.generated-map-lite .generated-map-marker,
                .generated-map-root.generated-map-moving .generated-map-marker,
                .generated-map-root.generated-map-lite .generated-map-marker-shell,
                .generated-map-root.generated-map-moving .generated-map-marker-shell {
                    filter: none !important;
                }

                .generated-map-marker-castle {
                    display: block;
                    width: 100%;
                    height: 100%;
                    fill: currentColor;
                    stroke: rgba(12, 12, 12, 0.88);
                    stroke-width: 0.42;
                    stroke-linejoin: round;
                    paint-order: stroke fill;
                }

                .generated-map-capture-burst {
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    width: 0.9rem;
                    height: 0.9rem;
                    margin-left: -0.45rem;
                    margin-top: -0.45rem;
                    border-radius: 999px;
                    border: 2px solid var(--burst-color);
                    box-shadow: 0 0 14px var(--burst-color);
                    animation: generated-map-capture-burst 0.85s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
                    pointer-events: none;
                }

                @keyframes generated-map-capture-burst {
                    0% {
                        transform: scale(0.5);
                        opacity: 0.95;
                    }
                    100% {
                        transform: scale(4);
                        opacity: 0;
                    }
                }

                .generated-map-fortify {
                    position: absolute;
                    top: -0.7rem;
                    left: 50%;
                    transform: translateX(-50%);
                    display: grid;
                    width: 0.9rem;
                    height: 0.9rem;
                    place-items: center;
                    color: ${mapColors.regions.region5};
                    filter: drop-shadow(0 0 4px rgba(200, 111, 60, 0.9));
                    animation: fortify-shimmer 1.5s ease-in-out infinite;
                    pointer-events: none;
                }

            `}
        </style>
    );
}
