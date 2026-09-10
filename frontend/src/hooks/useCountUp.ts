import { useEffect, useRef, useState } from "react";

/** Smoothly animates a number toward `target` (ease-out cubic). */
export function useCountUp(target: number, duration = 500): number {
    const [value, setValue] = useState(target);
    const previousRef = useRef(target);

    useEffect(() => {
        const from = previousRef.current;
        if (from === target) return;
        previousRef.current = target;

        const start = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setValue(Math.round(from + (target - from) * eased));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, duration]);

    return value;
}
