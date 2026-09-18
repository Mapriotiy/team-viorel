import { useEffect, useRef, useState } from 'react';
import { DIFFICULTY_COLORS } from '../mapRegions';
import { mapColors } from '../features/lobby-map/mapColors';
import { firstCaptureBonus, flagPoints } from '../scoring';

function formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export type Owner = 'player' | 'enemy';

type ProblemInfo = {
    title: string;
    title_slug: string;
    difficulty: string;
    url: string;
};

type ProvincePopupProps = {
    provinceId: string | null;
    provinceName?: string | null;
    pos: { x: number; y: number } | null;
    owner: Owner | undefined;
    capturedByUsername: string | undefined;
    problem: ProblemInfo | null;
    submissionUrl: string | null;
    capturerLeetcodeUsername: string | null;
    firstCaptureOwner?: Owner;
    capturedRuntimeMs?: number | null;
    fortified?: boolean;
    fortifiedUntil?: string | null;
    onClose: () => void;
};

export default function ProvincePopup({
    provinceId,
    provinceName,
    pos,
    owner,
    capturedByUsername,
    problem,
    submissionUrl,
    capturerLeetcodeUsername,
    firstCaptureOwner,
    capturedRuntimeMs,
    fortified = false,
    fortifiedUntil = null,
    onClose,
}: ProvincePopupProps) {
    const [now, setNow] = useState(() => Date.now());
    const popupRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!fortifiedUntil) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [fortifiedUntil]);

    useEffect(() => {
        if (!provinceId) return;

        const handlePointerDown = (event: PointerEvent) => {
            const popup = popupRef.current;
            if (!popup || popup.contains(event.target as Node)) return;
            const target = event.target as Element | null;
            if (target && target.closest && target.closest('button, input, select, textarea, a, [role="button"]')) return;
            onClose();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [onClose, provinceId]);

    if (!provinceId || !pos) return null;

    const accent = owner === 'player' ? mapColors.player : owner === 'enemy' ? mapColors.enemy : mapColors.neutral;

    const statusText =
        owner === 'player'
            ? 'Yours'
            : owner === 'enemy'
              ? capturedByUsername
                ? `${capturedByUsername}'s`
                : "Enemy's"
              : 'Free';

    const earnedPoints =
        owner === 'player'
            ? flagPoints(problem?.difficulty ?? '') +
              (firstCaptureOwner === 'player' ? firstCaptureBonus(problem?.difficulty) : 0)
            : 0;

    const clampedX = Math.max(90, Math.min(pos.x, window.innerWidth - 90));
    const flipBelow = pos.y < 170;

    return (
        <div className="pointer-events-none fixed inset-0 z-50">
            <div
                ref={popupRef}
                className="pointer-events-auto absolute bg-neutral-900 border rounded-lg p-3 shadow-2xl w-56"
                style={{
                    left: clampedX,
                    top: flipBelow ? pos.y + 10 : pos.y - 14,
                    transform: flipBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                    borderColor: accent + '4d',
                }}
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => e.preventDefault()}
            >
                {owner === 'player' && earnedPoints > 0 ? (
                    <span
                        key={provinceId}
                        className="point-pop pointer-events-none absolute -top-4 right-4 text-lg font-extrabold text-[#7f9a6e]"
                    >
                        +{earnedPoints}
                    </span>
                ) : null}
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white text-sm font-semibold">
                        {provinceName || provinceId}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-white text-lg leading-none"
                    >
                        &times;
                    </button>
                </div>

                <div className="flex items-center justify-between text-xs mb-2.5">
                    <span className="text-gray-400">Status</span>
                    <span style={{ color: accent }}>{statusText}</span>
                </div>

                {fortified && (
                    <div className="mb-2.5 rounded-md border border-[#e6a15d]/50 bg-[#e6a15d]/10 px-3 py-1.5 text-center text-xs font-semibold text-[#e8b691]">
                        <span className="flex items-center justify-center gap-1.5">
                            🛡 Fortified
                            {fortifiedUntil && (
                                <span className="tabular-nums text-[#e8b691]">
                                    ·{" "}
                                    {new Date(fortifiedUntil).getFullYear() >= 9999
                                        ? "∞"
                                        : `${formatDuration(new Date(fortifiedUntil).getTime() - now)} left`}
                                </span>
                            )}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-[#b8860b]">
                            safe from recapture
                        </span>
                    </div>
                )}

                {problem && (
                    <a
                        href={problem.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-sm text-[#f4e7d8] transition hover:border-white/30"
                    >
                        <span className="block truncate font-medium">
                            {problem.title}
                        </span>
                        <span className="mt-1 flex items-center justify-between text-xs font-medium">
                            <span
                                style={{
                                    color: DIFFICULTY_COLORS[problem.difficulty] ?? '#aaa',
                                }}
                            >
                                {problem.difficulty}
                            </span>
                            <span className="text-[#e6a15d]">
                                +{flagPoints(problem.difficulty)}
                            </span>
                        </span>
                    </a>
                )}

                {firstCaptureOwner && (
                    <div
                        className="mt-2 rounded-md border px-3 py-1.5 text-center text-xs font-medium"
                        style={{
                            borderColor:
                                (firstCaptureOwner === 'player' ? '#76b7a5' : '#b86a6f') + '4d',
                            color: firstCaptureOwner === 'player' ? '#76b7a5' : '#b86a6f',
                        }}
                    >
                        First capture +{firstCaptureBonus(problem?.difficulty)}
                        {firstCaptureOwner === 'player' ? ' (yours)' : ''}
                    </div>
                )}

                {owner && (
                    <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-gray-400">Fastest</span>
                        <span className="text-[#f4e7d8]">
                            {capturedRuntimeMs != null ? `${capturedRuntimeMs} ms` : 'unknown'}
                        </span>
                    </div>
                )}

                {owner === 'enemy' && (
                    <p className="mt-1.5 text-center text-[11px] text-[#8f8278]">
                        Solve it faster to steal this province
                    </p>
                )}

                {owner && submissionUrl && (
                    <a
                        href={submissionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block rounded-md border border-[#3f332d] bg-[#1b1512] px-3 py-2 text-center text-xs font-medium text-[#d9c5ad] transition hover:border-white/30 hover:text-white"
                    >
                        View {capturerLeetcodeUsername ?? 'capturer'}'s solution
                    </a>
                )}

                <div
                    className="absolute left-1/2 -bottom-[7px] -translate-x-1/2 w-0 h-0"
                    style={{
                        borderLeft: '7px solid transparent',
                        borderRight: '7px solid transparent',
                        borderTop: `7px solid ${accent}4d`,
                    }}
                />
            </div>
        </div>
    );
}
