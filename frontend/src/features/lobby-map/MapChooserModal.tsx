import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, Map as MapIcon, Pencil, RotateCcw, Shuffle, Trash2, X } from "lucide-react";
import { createMapPreset, deleteMapPreset, listMapPresets, type MapPreset } from "./api";
import { MAP_SIZE_CONFIG } from "./assets";
import { generateMapDraft, reassignRegions } from "./generatorClient";
import { GeneratedMapRenderer } from "./GeneratedMapRenderer";
import { DEFAULT_MAP_DRAFT } from "./defaultDraft";
import type { GeneratedMapDraft, GeneratedMapSize, LobbyMapSelection, LobbyMapTopic } from "./types";

type MapChooserModalProps = {
    open: boolean;
    availableTopics: LobbyMapTopic[];
    currentSelection: LobbyMapSelection;
    onClose: () => void;
    onSelect: (selection: LobbyMapSelection) => void | Promise<void>;
};

type CatalogPreview = { kind: "default" } | { kind: "preset"; preset: MapPreset };

const SIZE_ORDER = ["small", "medium", "large"] as const satisfies readonly GeneratedMapSize[];
const MAP_PREVIEW_ASPECT = 1321 / 900;

function normalizeTopicIds(topics: LobbyMapTopic[], selected: readonly string[]) {
    const known = new Set(topics.map((topic) => topic.id));
    const filtered = selected.filter((id) => known.has(id));
    return filtered.length ? filtered : topics.slice(0, 1).map((topic) => topic.id);
}

function catalogCardClass(active: boolean) {
    return `flex min-w-[13.75rem] items-center gap-3 rounded-md border px-3 py-3 text-left transition md:min-w-0 md:w-full ${
        active
            ? "border-[#e6a15d] bg-[#2a2418]"
            : "border-white/10 bg-[#24201c] hover:border-[#e6a15d]/60"
    }`;
}

function MapPreview({ draft }: { draft: GeneratedMapDraft }) {
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState<number | null>(null);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;

        const updateSize = () => {
            const rect = frame.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const nextWidth = Math.floor(Math.min(rect.width, rect.height * MAP_PREVIEW_ASPECT));
            setWidth((current) => (current === nextWidth ? current : nextWidth));
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(frame);
        window.addEventListener("orientationchange", updateSize);

        return () => {
            observer.disconnect();
            window.removeEventListener("orientationchange", updateSize);
        };
    }, []);

    return (
        <div ref={frameRef} className="flex h-full min-h-0 w-full items-center justify-center">
            <div className="max-w-full" style={{ width: width ? `${width}px` : "100%" }}>
                <GeneratedMapRenderer
                    draft={draft}
                    className="mx-auto w-full"
                    showMarkers={false}
                    showRoads={false}
                    showEffects={false}
                />
            </div>
        </div>
    );
}

export function MapChooserModal({
    open,
    availableTopics,
    currentSelection,
    onClose,
    onSelect,
}: MapChooserModalProps) {
    const [tab, setTab] = useState<"catalog" | "custom">("catalog");
    const [size, setSize] = useState<GeneratedMapSize>("medium");
    const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(() => availableTopics.map((topic) => topic.id));
    const [draft, setDraft] = useState<GeneratedMapDraft | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [presets, setPresets] = useState<MapPreset[]>([]);
    const [isSavingPreset, setIsSavingPreset] = useState(false);
    const [catalogPreview, setCatalogPreview] = useState<CatalogPreview>({ kind: "default" });

    const selectedTopics = useMemo(() => {
        const ids = new Set(normalizeTopicIds(availableTopics, selectedTopicIds));
        return availableTopics.filter((topic) => ids.has(topic.id));
    }, [availableTopics, selectedTopicIds]);

    const isDefaultCurrent = currentSelection.draft.id === DEFAULT_MAP_DRAFT.id;
    function isPresetCurrent(preset: MapPreset) {
        return currentSelection.kind === "generated" && currentSelection.draft.id === preset.draft.id;
    }

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        // Assume the catalog until we know otherwise; corrected below once presets load.
        setTab("catalog");
        setCatalogPreview({ kind: "default" });
        setDraft(null);
        setSelectedTopicIds(availableTopics.map((topic) => topic.id));

        listMapPresets()
            .then((loaded) => {
                if (cancelled) return;
                setPresets(loaded);
                if (currentSelection.kind !== "generated") return;

                const matched = loaded.find((preset) => preset.draft.id === currentSelection.draft.id);
                if (matched) {
                    setCatalogPreview({ kind: "preset", preset: matched });
                    return;
                }

                // A generated draft that isn't a saved preset can only be edited from Custom.
                setTab("custom");
                setSize(currentSelection.draft.size);
                setDraft(currentSelection.draft);
                setSelectedTopicIds(currentSelection.draft.topics.map((topic) => topic.id));
            })
            .catch(() => {
                // Presets are a convenience; a load failure shouldn't block the chooser.
            });

        return () => {
            cancelled = true;
        };
    }, [availableTopics, currentSelection, open]);

    async function saveCurrentAsPreset() {
        if (!draft) return;
        const name = window.prompt("Preset name")?.trim();
        if (!name) return;

        setIsSavingPreset(true);
        setError(null);
        try {
            const preset = await createMapPreset(name, draft);
            setPresets((current) => [preset, ...current]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save preset");
        } finally {
            setIsSavingPreset(false);
        }
    }

    function editPresetInCustom(preset: MapPreset) {
        setError(null);
        setSize(preset.draft.size);
        setDraft(preset.draft);
        setSelectedTopicIds(preset.draft.topics.map((topic) => topic.id));
        setTab("custom");
    }

    async function removePreset(preset: MapPreset) {
        const previous = presets;
        setPresets((current) => current.filter((item) => item.id !== preset.id));
        if (catalogPreview.kind === "preset" && catalogPreview.preset.id === preset.id) {
            setCatalogPreview({ kind: "default" });
        }
        try {
            await deleteMapPreset(preset.id);
        } catch (e) {
            setPresets(previous);
            setError(e instanceof Error ? e.message : "Failed to delete preset");
        }
    }

    async function generateNextDraft(nextSize = size) {
        setIsGenerating(true);
        setError(null);
        try {
            const nextDraft = await generateMapDraft({
                size: nextSize,
                topics: selectedTopics,
            });
            setDraft(nextDraft);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to generate map");
        } finally {
            setIsGenerating(false);
        }
    }

    async function applyTopicsOnly() {
        if (!draft || draft.size !== size) {
            await generateNextDraft();
            return;
        }

        setIsGenerating(true);
        setError(null);
        try {
            setDraft(await reassignRegions(draft, selectedTopics));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to update regions");
        } finally {
            setIsGenerating(false);
        }
    }

    function toggleTopic(topicId: string) {
        setSelectedTopicIds((ids) => {
            if (ids.includes(topicId)) {
                if (ids.length === 1) return ids;
                return ids.filter((id) => id !== topicId);
            }
            return [...ids, topicId];
        });
    }

    async function applySelection(selection: LobbyMapSelection) {
        setIsApplying(true);
        setError(null);
        try {
            await onSelect(selection);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save map");
        } finally {
            setIsApplying(false);
        }
    }

    function chooseDefault() {
        void applySelection({ kind: "generated", draft: DEFAULT_MAP_DRAFT });
    }

    function chooseCatalogPreview() {
        if (catalogPreview.kind === "default") {
            chooseDefault();
            return;
        }
        void applySelection({ kind: "generated", draft: catalogPreview.preset.draft });
    }

    function chooseGenerated() {
        if (!draft) return;
        void applySelection({ kind: "generated", draft });
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/70 text-white sm:p-4 2xl:p-6" onMouseDown={onClose}>
            <div
                className="mx-auto flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden rounded-none border-y border-[#3f332d] bg-[#211a16] shadow-2xl sm:h-[90vh] sm:max-h-[calc(100dvh-2rem)] sm:w-full sm:max-w-[96vw] sm:rounded-lg sm:border xl:h-[88vh] xl:max-w-[1500px] 2xl:h-[86vh] 2xl:max-h-[1280px] 2xl:max-w-[1800px] min-[2200px]:h-[82vh] min-[2200px]:max-h-[1400px] min-[2200px]:max-w-[2100px] min-[3000px]:h-[78vh] min-[3000px]:max-h-[1520px] min-[3000px]:max-w-[2400px]"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="flex items-center justify-between border-b border-white/10 px-3 py-2 sm:px-4 sm:py-3 2xl:px-5">
                    <div>
                        <h2 className="text-lg font-semibold tracking-normal">Choose Map</h2>
                        <p className="mt-0.5 hidden text-sm text-[#8f8278] sm:block">Catalog preset or generated lobby draft</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-9 w-9 place-items-center rounded-md border border-white/10 bg-[#24201c] text-[#d9c5ad] transition hover:border-[#e6a15d]/60 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </header>

                <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)] min-[2200px]:grid-cols-[340px_minmax(0,1fr)]">
                    <aside className="shrink-0 border-b border-white/10 p-2.5 sm:p-3 md:overflow-auto md:border-b-0 md:border-r md:p-4 2xl:p-5">
                        <div className="grid grid-cols-2 gap-2">
                            {(["catalog", "custom"] as const).map((nextTab) => (
                                <button
                                    key={nextTab}
                                    type="button"
                                    onClick={() => setTab(nextTab)}
                                    className={`h-9 rounded-md border text-sm font-medium ${
                                        tab === nextTab
                                            ? "border-[#e6a15d] bg-[#e6a15d] text-[#191410]"
                                            : "border-white/10 bg-[#211a16] text-[#d9c5ad] hover:border-[#e6a15d]/60"
                                    }`}
                                >
                                    {nextTab === "catalog" ? "Catalog" : "Custom"}
                                </button>
                            ))}
                        </div>

                        {tab === "catalog" ? (
                            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:mt-4 md:block md:max-h-[70vh] md:space-y-2 md:overflow-auto md:pb-0 md:pr-1">
                                <button
                                    type="button"
                                    onClick={() => setCatalogPreview({ kind: "default" })}
                                    className={catalogCardClass(catalogPreview.kind === "default")}
                                >
                                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#e6a15d]/15 text-[#e6a15d]">
                                        <MapIcon size={18} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-white">Default Map</span>
                                        <span className="mt-0.5 block text-xs text-[#8f8278]">Current production layout</span>
                                    </span>
                                    {isDefaultCurrent ? <Check size={16} className="shrink-0 text-[#e6a15d]" /> : null}
                                </button>

                                {presets.length === 0 ? (
                                    <p className="min-w-[13.75rem] px-1 text-xs text-[#8f8278] md:min-w-0">
                                        Generate a map from the Custom tab, then "Save preset" to add it here.
                                    </p>
                                ) : (
                                    presets.map((preset) => (
                                        <div key={preset.id} className="flex min-w-[16.5rem] items-center gap-1 md:min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => setCatalogPreview({ kind: "preset", preset })}
                                                className={catalogCardClass(
                                                    catalogPreview.kind === "preset" && catalogPreview.preset.id === preset.id,
                                                )}
                                            >
                                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/5 text-[#e6a15d]">
                                                    <Bookmark size={16} />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-semibold text-white">{preset.name}</span>
                                                    <span className="mt-0.5 block text-xs text-[#8f8278]">
                                                        {MAP_SIZE_CONFIG[preset.draft.size].label} · {preset.draft.provinceCount} provinces
                                                    </span>
                                                </span>
                                                {isPresetCurrent(preset) ? <Check size={16} className="shrink-0 text-[#e6a15d]" /> : null}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removePreset(preset)}
                                                aria-label={`Delete preset ${preset.name}`}
                                                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/10 bg-[#24201c] text-[#8f8278] transition hover:text-red-400"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        ) : (
                            <div className="mt-3 space-y-2 md:mt-4 md:space-y-4">
                                <div>
                                    <p className="mb-2 text-xs uppercase tracking-wide text-[#8f8278]">Size</p>
                                    <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
                                        {SIZE_ORDER.map((nextSize) => {
                                            const config = MAP_SIZE_CONFIG[nextSize];
                                            const active = size === nextSize;
                                            return (
                                                <button
                                                    key={nextSize}
                                                    type="button"
                                                    onClick={() => {
                                                        setSize(nextSize);
                                                        setDraft(null);
                                                    }}
                                                    className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                                                        active
                                                            ? "border-[#e6a15d] bg-[#e6a15d]/12 text-white"
                                                            : "border-white/10 bg-[#211a16] text-[#d9c5ad] hover:border-[#e6a15d]/60"
                                                    }`}
                                                >
                                                    <span>{config.label}</span>
                                                    <span className="text-xs text-[#8f8278]">~{config.target}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <p className="mb-2 text-xs uppercase tracking-wide text-[#8f8278]">Topics</p>
                                    <div className="flex gap-2 overflow-x-auto pb-1 md:block md:max-h-72 md:space-y-2 md:overflow-auto md:pb-0 md:pr-1">
                                        {availableTopics.map((topic) => {
                                            const checked = selectedTopicIds.includes(topic.id);
                                            return (
                                                <button
                                                    key={topic.id}
                                                    type="button"
                                                    onClick={() => toggleTopic(topic.id)}
                                                    className={`flex min-w-[8.75rem] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition md:w-full md:min-w-0 ${
                                                        checked
                                                            ? "border-[#e6a15d]/50 bg-[#2b211c] text-white"
                                                            : "border-white/10 bg-[#24201c] text-[#8f8278] hover:border-[#e6a15d]/40"
                                                    }`}
                                                >
                                                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: topic.color }} />
                                                    <span className="min-w-0 flex-1">{topic.name}</span>
                                                    {checked ? <Check size={15} className="text-[#e6a15d]" /> : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </aside>

                    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:p-3 md:overflow-auto md:p-4 2xl:p-5">
                        {tab === "catalog" ? (
                            <div className="flex min-h-0 flex-1 flex-col gap-3">
                                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm text-[#d9c5ad]">
                                        {catalogPreview.kind === "default"
                                            ? "Production map layout"
                                            : `${catalogPreview.preset.draft.provinceCount} provinces / ${catalogPreview.preset.draft.regionCount} regions`}
                                    </div>
                                    <div className="hidden flex-wrap justify-end gap-2 sm:flex">
                                        {catalogPreview.kind === "preset" ? (
                                            <button
                                                type="button"
                                                onClick={() => editPresetInCustom(catalogPreview.preset)}
                                                className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#24201c] px-2 text-xs text-[#d9c5ad] transition hover:border-[#e6a15d]/60 sm:gap-2 sm:px-3 sm:text-sm"
                                            >
                                                <Pencil size={15} />
                                                <span className="hidden sm:inline">Customize</span>
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={chooseCatalogPreview}
                                            disabled={isApplying}
                                            className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-[#e6a15d] bg-[#e6a15d] px-2 text-xs font-semibold text-[#191410] disabled:cursor-not-allowed disabled:border-[#5f4a25] disabled:bg-[#5f4a25] disabled:text-[#a8917d] sm:gap-2 sm:px-3 sm:text-sm"
                                        >
                                            <Check size={15} />
                                            {isApplying ? "Saving..." : "Use This Map"}
                                        </button>
                                    </div>
                                </div>

                                {error ? (
                                    <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                        {error}
                                    </p>
                                ) : null}

                                <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-lg bg-[#1b1512] p-2 text-center sm:p-3 2xl:p-4">
                                    {catalogPreview.kind === "default" ? (
                                        <MapPreview draft={DEFAULT_MAP_DRAFT} />
                                    ) : (
                                        <MapPreview draft={catalogPreview.preset.draft} />
                                    )}
                                </div>
                                <div className="shrink-0 border-t border-white/10 pt-2 sm:hidden">
                                    <div className={catalogPreview.kind === "preset" ? "grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-2" : "grid"}>
                                        {catalogPreview.kind === "preset" ? (
                                            <button
                                                type="button"
                                                onClick={() => editPresetInCustom(catalogPreview.preset)}
                                                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 bg-[#24201c] px-3 text-sm font-semibold text-[#d9c5ad] transition hover:border-[#e6a15d]/60"
                                            >
                                                <Pencil size={16} />
                                                Customize
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={chooseCatalogPreview}
                                            disabled={isApplying}
                                            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#e6a15d] bg-[#e6a15d] px-3 text-sm font-bold text-[#191410] disabled:cursor-not-allowed disabled:border-[#5f4a25] disabled:bg-[#5f4a25] disabled:text-[#a8917d]"
                                        >
                                            <Check size={16} />
                                            {isApplying ? "Saving..." : "Use Map"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col gap-3">
                                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="text-sm text-[#d9c5ad]">
                                        {draft ? `${draft.provinceCount} provinces / ${draft.regionCount} regions` : "No generated draft yet"}
                                    </div>
                                    <div className="hidden gap-2 sm:flex sm:flex-wrap">
                                        <button
                                            type="button"
                                            onClick={applyTopicsOnly}
                                            disabled={isGenerating || selectedTopics.length === 0}
                                            className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#24201c] px-2 text-xs text-[#d9c5ad] transition hover:border-[#e6a15d]/60 disabled:cursor-not-allowed disabled:text-[#8f8278] sm:gap-2 sm:px-3 sm:text-sm"
                                        >
                                            <RotateCcw size={15} />
                                            <span className="hidden sm:inline">Apply Topics</span>
                                            <span className="sm:hidden">Topics</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => generateNextDraft()}
                                            disabled={isGenerating || selectedTopics.length === 0}
                                            className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#24201c] px-2 text-xs text-[#d9c5ad] transition hover:border-[#e6a15d]/60 disabled:cursor-not-allowed disabled:text-[#8f8278] sm:gap-2 sm:px-3 sm:text-sm"
                                        >
                                            <Shuffle size={15} />
                                            {isGenerating ? "Generating..." : "Reroll"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveCurrentAsPreset}
                                            disabled={!draft || isGenerating || isSavingPreset}
                                            className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#24201c] px-2 text-xs text-[#d9c5ad] transition hover:border-[#e6a15d]/60 disabled:cursor-not-allowed disabled:text-[#8f8278] sm:gap-2 sm:px-3 sm:text-sm"
                                        >
                                            <Bookmark size={15} />
                                            <span className="hidden sm:inline">{isSavingPreset ? "Saving..." : "Save preset"}</span>
                                            <span className="sm:hidden">Save</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={chooseGenerated}
                                            disabled={!draft || isGenerating || isApplying}
                                            className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-[#e6a15d] bg-[#e6a15d] px-2 text-xs font-semibold text-[#191410] disabled:cursor-not-allowed disabled:border-[#5f4a25] disabled:bg-[#5f4a25] disabled:text-[#a8917d] sm:gap-2 sm:px-3 sm:text-sm"
                                        >
                                            <Check size={15} />
                                            {isApplying ? "Saving..." : "Use Map"}
                                        </button>
                                    </div>
                                </div>

                                {error ? (
                                    <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                        {error}
                                    </p>
                                ) : null}

                                {draft ? (
                                    <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-lg bg-[#1b1512] p-2 text-center sm:p-3 2xl:p-4">
                                        <MapPreview draft={draft} />
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => generateNextDraft()}
                                        disabled={isGenerating || selectedTopics.length === 0}
                                        className="flex min-h-[17.5rem] flex-1 items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#1b1512] text-sm font-medium text-[#d9c5ad] transition hover:border-[#e6a15d]/60 hover:text-white disabled:cursor-not-allowed disabled:text-[#8f8278] md:min-h-[26.25rem]"
                                    >
                                        {isGenerating ? "Generating..." : "Generate Map"}
                                    </button>
                                )}
                                <div className="shrink-0 border-t border-white/10 pt-2 sm:hidden">
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={applyTopicsOnly}
                                            disabled={isGenerating || selectedTopics.length === 0}
                                            className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#24201c] px-2 text-xs font-semibold text-[#d9c5ad] transition hover:border-[#e6a15d]/60 disabled:cursor-not-allowed disabled:text-[#8f8278]"
                                        >
                                            <RotateCcw size={14} />
                                            Topics
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => generateNextDraft()}
                                            disabled={isGenerating || selectedTopics.length === 0}
                                            className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#24201c] px-2 text-xs font-semibold text-[#d9c5ad] transition hover:border-[#e6a15d]/60 disabled:cursor-not-allowed disabled:text-[#8f8278]"
                                        >
                                            <Shuffle size={14} />
                                            {isGenerating ? "..." : "Reroll"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveCurrentAsPreset}
                                            disabled={!draft || isGenerating || isSavingPreset}
                                            className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-white/10 bg-[#24201c] px-2 text-xs font-semibold text-[#d9c5ad] transition hover:border-[#e6a15d]/60 disabled:cursor-not-allowed disabled:text-[#8f8278]"
                                        >
                                            <Bookmark size={14} />
                                            {isSavingPreset ? "..." : "Save"}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={chooseGenerated}
                                        disabled={!draft || isGenerating || isApplying}
                                        className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#e6a15d] bg-[#e6a15d] px-3 text-sm font-bold text-[#191410] disabled:cursor-not-allowed disabled:border-[#5f4a25] disabled:bg-[#5f4a25] disabled:text-[#a8917d]"
                                    >
                                        <Check size={16} />
                                        {isApplying ? "Saving..." : "Use Map"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
