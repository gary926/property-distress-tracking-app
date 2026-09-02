import { useEffect, useRef, useState } from "react";

/** Animates a number from 0 to its target on mount (respects reduced motion). */
export function useCountUp(target: number, durationMs = 800): number {
  const [value, setValue] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs]);

  return value;
}
