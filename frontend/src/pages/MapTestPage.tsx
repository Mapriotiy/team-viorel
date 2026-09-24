import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Layers, Save, Shuffle } from "lucide-react";
import { DEFAULT_REGION_COUNTS, MAP_SIZE_CONFIG, REGION_FALLBACK_COLORS } from "../features/lobby-map/assets";
import { GeneratedMapRenderer } from "../features/lobby-map/GeneratedMapRenderer";
import { generatedRegionsAsLegend } from "../features/lobby-map/generator";
import {
    generateMapDraft,
    reassignRegions as reassignRegionsOffThread,
} from "../features/lobby-map/generatorClient";
import type { GeneratedMapDraft, GeneratedMapSize, LobbyMapTopic } from "../features/lobby-map/types";
import { TOPICS } from "../mapRegions";

const MAP_SIZES = ["small", "medium", "large"] as const satisfies readonly GeneratedMapSize[];

function topicsForCount(count: number): LobbyMapTopic[] {
    return Array.from({ length: count }, (_, index) => {
        const region = TOPICS[index % TOPICS.length];
        return {
            id: `${region.id}-${index}`,
            name: index < TOPICS.length ? region.name : `Region ${index + 1}`,
            color: region.color || REGION_FALLBACK_COLORS[index % REGION_FALLBACK_COLORS.length],
        };
    });
}

export function MapTestPage() {
    const [mapSize, setMapSize] = useState<GeneratedMapSize>("medium");
    const [regionCount, setRegionCount] = useState(DEFAULT_REGION_COUNTS.medium);
    const [draft, setDraft] = useState<GeneratedMapDraft | null>(null);
    const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
    const [status, setStatus] = useState("Ready to generate");
    const [isGenerating, setIsGenerating] = useState(false);
    const [showBack, setShowBack] = useState(true);
    const [showFill, setShowFill] = useState(true);
    const [overlayOpacity, setOverlayOpacity] = useState(68);
    const [strokeWidth, setStrokeWidth] = useState(1.15);

    const topics = useMemo(() => topicsForCount(regionCount), [regionCount]);
    const regions = useMemo(() => (draft ? generatedRegionsAsLegend(draft) : []), [draft]);

    async function generate(nextSize = mapSize, nextTopics = topics) {
        setIsGenerating(true);
        setStatus("Building island map...");
        setSelectedProvince(null);
        try {
            const nextDraft = await generateMapDraft({
                size: nextSize,
                topics: nextTopics,
            });
            setDraft(nextDraft);
            setStatus(`${nextDraft.provinceCount} provinces / ${nextDraft.regionCount} regions`);
        } catch (e) {
            setDraft(null);
            setStatus(e instanceof Error ? e.message : "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    }

    async function reassignRegions() {
        if (!draft) {
            await generate();
            return;
        }
        setIsGenerating(true);
        setStatus("Rebuilding regions...");
        setSelectedProvince(null);
        try {
            const nextDraft = await reassignRegionsOffThread(draft, topics);
            setDraft(nextDraft);
            setStatus(`${nextDraft.provinceCount} provinces / ${nextDraft.regionCount} regions`);
        } catch (e) {
            setStatus(e instanceof Error ? e.message : "Region update failed");
        } finally {
            setIsGenerating(false);
        }
    }

    function saveDraft() {
        if (!draft) return;
        localStorage.setItem("map-test-lobby-draft", JSON.stringify(draft));
        setStatus(`Saved draft - ${draft.provinceCount} provinces / ${draft.regionCount} regions`);
    }

    useEffect(() => {
        generate();
        // Initial generation only. The controls below decide whether to reroll islands or just recolor regions.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main className="min-h-screen bg-[#141414] p-4 text-[#f2f2f2] md:p-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <section className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-normal text-white">Map Generator Test</h1>
                        <p className="mt-1 text-sm text-[#9a9a9a]">
                            {status} {selectedProvince ? `- selected ${selectedProvince}` : ""}
                        </p>
                    </div>

                    <a
                        href={window.location.pathname}
                        className="rounded-md border border-white/10 bg-[#222] px-3 py-2 text-sm text-[#d8d8d8] hover:border-[#ffad42]/60 hover:text-white"
                    >
                        Exit Test
                    </a>
                </section>

                <section className="grid gap-3 rounded-md border border-white/10 bg-[#202020] p-3 md:grid-cols-[auto_auto_1fr_auto] md:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-[#888]">Size</span>
                        {MAP_SIZES.map((nextSize) => (
                            <button
                                key={nextSize}
                                type="button"
                                onClick={() => {
                                    const nextRegionCount = DEFAULT_REGION_COUNTS[nextSize];
                                    setMapSize(nextSize);
                                    setRegionCount(nextRegionCount);
                                    generate(nextSize, topicsForCount(nextRegionCount));
                                }}
                                className={`h-8 rounded-md border px-2 text-sm ${
                                    mapSize === nextSize
                                        ? "border-[#ffad42] bg-[#ffad42] text-[#151515]"
                                        : "border-white/10 bg-[#2a2a2a] text-[#d8d8d8] hover:border-[#ffad42]/60"
                                }`}
                            >
                                {MAP_SIZE_CONFIG[nextSize].label}
                            </button>
                        ))}
                    </div>

                    <label className="flex min-w-56 items-center gap-2 text-sm text-[#d8d8d8]">
                        <Layers size={15} />
                        <span className="text-xs uppercase tracking-wide text-[#888]">Regions</span>
                        <input
                            type="range"
                            min={2}
                            max={12}
                            value={regionCount}
                            onChange={(event) => setRegionCount(Number(event.target.value))}
                            onMouseUp={reassignRegions}
                            onTouchEnd={reassignRegions}
                            className="min-w-28 accent-[#ffad42]"
                        />
                        <span className="w-5 text-right tabular-nums text-[#ffad42]">{regionCount}</span>
                    </label>

                    <div className="flex flex-wrap items-center gap-3 text-sm text-[#d8d8d8]">
                        <button
                            type="button"
                            onClick={() => setShowBack((value) => !value)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-[#2a2a2a] px-2 hover:border-[#ffad42]/60"
                        >
                            {showBack ? <Eye size={15} /> : <EyeOff size={15} />}
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowFill((value) => !value)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-[#2a2a2a] px-2 hover:border-[#ffad42]/60"
                        >
                            {showFill ? <Eye size={15} /> : <EyeOff size={15} />}
                            Fill
                        </button>
                        <label className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-[#888]">Opacity</span>
                            <input
                                type="range"
                                min={20}
                                max={100}
                                value={overlayOpacity}
                                onChange={(event) => setOverlayOpacity(Number(event.target.value))}
                                className="w-24 accent-[#ffad42]"
                            />
                        </label>
                        <label className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-wide text-[#888]">Stroke</span>
                            <input
                                type="range"
                                min={0.5}
                                max={3}
                                step={0.1}
                                value={strokeWidth}
                                onChange={(event) => setStrokeWidth(Number(event.target.value))}
                                className="w-24 accent-[#ffad42]"
                            />
                        </label>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                        <button
                            type="button"
                            onClick={saveDraft}
                            disabled={!draft}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-[#2a2a2a] px-2 text-sm text-[#d8d8d8] hover:border-[#ffad42]/60 disabled:cursor-not-allowed disabled:text-[#777]"
                        >
                            <Save size={15} />
                            Save
                        </button>
                        <button
                            type="button"
                            onClick={() => generate()}
                            disabled={isGenerating}
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#ffad42] bg-[#ffad42] px-2 text-sm font-semibold text-[#151515] disabled:cursor-not-allowed disabled:border-[#76511e] disabled:bg-[#76511e] disabled:text-[#aaa]"
                        >
                            <Shuffle size={15} />
                            {isGenerating ? "Generating..." : "Reroll"}
                        </button>
                    </div>
                </section>

                {draft ? (
                    <section className="grid gap-4 lg:grid-cols-[180px_1fr]">
                        <ul className="flex list-none flex-col gap-2 rounded-md border border-white/10 bg-[#202020] p-3">
                            {regions.map((region) => (
                                <li
                                    key={region.id}
                                    className="flex items-center gap-2 rounded-md border border-white/10 bg-[#1b1b1b] px-3 py-2 text-sm"
                                >
                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: region.color }} />
                                    <span className="min-w-0 flex-1">{region.name}</span>
                                    <span className="text-xs tabular-nums text-[#888]">{region.provinces.length}</span>
                                </li>
                            ))}
                        </ul>
                        <GeneratedMapRenderer
                            draft={draft}
                            showBack={showBack}
                            showFill={showFill}
                            overlayOpacity={overlayOpacity / 100}
                            strokeWidth={strokeWidth}
                            onSelect={(id) => {
                                const province = draft.provinces.find((item) => item.provinceId === id);
                                setSelectedProvince(province ? `${province.name} / ${province.regionId}` : id);
                            }}
                        />
                    </section>
                ) : (
                    <section className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#202020] text-sm text-[#9a9a9a]">
                        {isGenerating ? "Generating..." : "No map yet"}
                    </section>
                )}
            </div>
        </main>
    );
}
