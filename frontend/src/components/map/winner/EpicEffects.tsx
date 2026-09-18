import { useMemo, type CSSProperties } from "react";

/** Floating glowing particles drifting upward across the screen. */
export function EpicParticles({ color, count = 18 }: { color: string; count?: number }) {
    const particles = useMemo(
        () =>
            Array.from({ length: count }, (_, i) => ({
                left: (i * 37) % 100,
                size: 3 + (i % 5),
                delay: (i % 24) * 0.35,
                duration: 5 + (i % 5) * 1.3,
                drift: -36 + ((i * 23) % 73),
                opacity: 0.45 + ((i * 17) % 45) / 100,
            })),
        [count],
    );

    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {particles.map((p, index) => (
                <span
                    key={index}
                    className="particle"
                    style={
                        {
                            left: `${p.left}%`,
                            width: p.size,
                            height: p.size,
                            backgroundColor: color,
                            opacity: p.opacity,
                            boxShadow: `0 0 7px ${color}`,
                            "--particle-dur": `${p.duration}s`,
                            "--particle-delay": `${p.delay}s`,
                            "--particle-drift": `${p.drift}px`,
                        } as CSSProperties
                    }
                />
            ))}
        </div>
    );
}

/** Pulsing vertical light beams + wide edge glows hugging the screen sides. */
export function SideBeams({ color }: { color: string }) {
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
                className="absolute inset-y-0 left-0 w-52"
                style={{ background: `linear-gradient(90deg, ${color}30, transparent)` }}
            />
            <div
                className="absolute inset-y-0 right-0 w-52"
                style={{ background: `linear-gradient(270deg, ${color}30, transparent)` }}
            />
            <div className="side-beam" style={{ left: 10, "--beam-color": color } as CSSProperties} />
            <div className="side-beam" style={{ right: 10, "--beam-color": color } as CSSProperties} />
        </div>
    );
}
