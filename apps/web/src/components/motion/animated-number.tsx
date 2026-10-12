"use client";

import { useEffect, useRef, useState } from "react";
import { EASE_OUT_EXPO } from "./easing";

/** The cubic-bezier of `EASE_OUT_EXPO`, solved for t by a few Newton steps. */
function easeOut(progress: number): number {
  const [x1, y1, x2, y2] = EASE_OUT_EXPO;
  const bezier = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  let t = progress;
  for (let i = 0; i < 5; i += 1) {
    const x = bezier(x1, x2, t) - progress;
    const slope = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * (1 - t) * t + 3 * (1 - x2) * t ** 2;
    if (Math.abs(slope) < 1e-6) break;
    t -= x / slope;
  }
  return bezier(y1, y2, Math.min(1, Math.max(0, t)));
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that counts to its new value instead of jumping: a subtotal when an item is added, a
 * quantity, a result count. The first render shows the value as is (nothing to animate from, and
 * no mismatch with the server), and so does anyone who asked for reduced motion. It is plain text,
 * not a live region, so a screen reader reads the figure when it reaches it, not every step.
 */
export function AnimatedNumber({
  value,
  format = String,
  duration = 450,
  className,
}: {
  value: number;
  format?: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const instant = reducedMotion();

  useEffect(() => {
    const start = from.current;
    if (instant || start === value) {
      from.current = value;
      return;
    }
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      const current = start + (value - start) * easeOut(progress);
      from.current = current;
      setShown(progress === 1 ? value : current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, instant]);

  // Reduced motion shows the value itself; otherwise the last frame of the count (which ends on it).
  const display = instant ? value : shown;
  return <span className={className}>{format(Math.round(display))}</span>;
}
