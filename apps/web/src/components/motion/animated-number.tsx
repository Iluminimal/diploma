"use client";

import { useEffect, useRef, useState } from "react";
import { EASE_OUT_EXPO } from "./easing";

/** `EASE_OUT_EXPO`-ийн cubic-bezier, t-г Newton-ы цөөн алхмаар бодсон. */
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
 * Шууд үсрэхийн оронд шинэ утга руугаа тоологддог тоо: бараа нэмэхэд subtotal, тоо ширхэг, үр
 * дүнгийн тоо. Эхний render утгыг шууд харуулна (animation эхлэх зүйл байхгүй, server-тэй
 * зөрөхгүй), reduced motion хүссэн хүнд ч мөн адил. Энгийн текст, live region биш: screen reader
 * алхам бүрийг биш, тоо хүрсэн үед нь уншина.
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

  // Reduced motion утгыг шууд харуулна; үгүй бол тоололтын сүүлийн frame (утгандаа дуусна).
  const display = instant ? value : shown;
  return <span className={className}>{format(Math.round(display))}</span>;
}
