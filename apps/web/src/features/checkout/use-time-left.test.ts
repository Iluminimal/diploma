import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTimeLeft, useTimeLeft } from "./use-time-left";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("useTimeLeft", () => {
  it("counts down the seconds to the deadline and stops at zero", () => {
    const { result } = renderHook(() => useTimeLeft("2026-11-18T10:00:03Z"));
    expect(result.current).toBe(3);

    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(1);

    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });

  it("is null when there is no deadline", () => {
    expect(renderHook(() => useTimeLeft(null)).result.current).toBeNull();
  });
});

describe("formatTimeLeft", () => {
  it.each([
    [1805, "30:05"],
    [59, "0:59"],
    [0, "0:00"],
  ])("formats %i seconds as %s", (seconds, text) => {
    expect(formatTimeLeft(seconds)).toBe(text);
  });
});
