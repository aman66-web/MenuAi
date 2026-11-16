"use client";

import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts from 0 up to `target` in `ms` milliseconds (the Truth card's "count-up" when it opens). With reduced motion, or when `replay` hasn't changed
 * and the target is the same, the final number is shown at once. Changing `replay` runs it again (Creator View's "Replay" button).
 */
export function useCountUp(target: number, ms = 300, replay = 0): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const frame = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      frame.current = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame.current);
    }
    let start: number | null = null;
    const step = (now: number) => {
      start ??= now;
      const p = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - p) * (1 - p)))); // ease out
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, ms, replay]);
  return value;
}
