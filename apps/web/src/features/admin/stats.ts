export type Change = {
  kind: "up" | "down" | "flat" | "new" | "none";
  percent: number;
};

/** How a figure moved against the period before it. */
export function change(current: number, previous: number): Change {
  if (previous === 0)
    return current === 0
      ? { kind: "none", percent: 0 }
      : { kind: "new", percent: 0 };
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return { kind: "flat", percent: 0 };
  return { kind: percent > 0 ? "up" : "down", percent: Math.abs(percent) };
}

/** The next "round" number (1, 2 or 5 times a power of ten) at or above `max`: a tidy top for an axis. */
export function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const fraction = max / magnitude;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * magnitude;
}

export type Bar = { x: number; width: number; height: number };

/** Bars for a chart drawn in a 100 x 100 box, tallest at `ceiling`, one slot per value. */
export function bars(values: readonly number[], ceiling: number): Bar[] {
  const slot = 100 / Math.max(values.length, 1);
  return values.map((value, index) => ({
    x: index * slot + slot * 0.15,
    width: slot * 0.7,
    // A day with sales always shows, however small next to the best day.
    height: value <= 0 ? 0 : Math.max((value / ceiling) * 100, 1.5),
  }));
}
