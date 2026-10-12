import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedNumber } from "./animated-number";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function reduceMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AnimatedNumber", () => {
  it("shows the first value as it is", () => {
    render(<AnimatedNumber value={1250} format={money} />);

    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });

  it("counts through in-between values and lands exactly on the new one", async () => {
    const { rerender } = render(<AnimatedNumber value={1000} format={money} duration={400} />);

    rerender(<AnimatedNumber value={3000} format={money} duration={400} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    const middle = Number(screen.getByText(/^\$/).textContent!.slice(1));
    expect(middle).toBeGreaterThan(10);
    expect(middle).toBeLessThan(30);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByText("$30.00")).toBeInTheDocument();
  });

  it("jumps straight to the value when motion is reduced", async () => {
    reduceMotion(true);
    const { rerender } = render(<AnimatedNumber value={1000} format={money} />);

    rerender(<AnimatedNumber value={3000} format={money} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });

    expect(screen.getByText("$30.00")).toBeInTheDocument();
  });
});
