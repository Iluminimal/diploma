import { describe, expect, it } from "vitest";
import { runLimited, tally } from "./bulk";

describe("runLimited", () => {
  it("returns every result in order", async () => {
    const results = await runLimited([1, 2, 3], 2, async (n) => n * 10);
    expect(results.map((r) => (r.status === "fulfilled" ? r.value : null))).toEqual([10, 20, 30]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await runLimited([1, 2, 3, 4, 5, 6], 2, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
    });
    expect(peak).toBe(2);
  });

  it("keeps going when one fails and says which did", async () => {
    const results = await runLimited([1, 2, 3], 3, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(results[1]!.status).toBe("rejected");
    expect(tally(results)).toEqual({ done: 2, failed: 1 });
  });

  it("handles nothing to do", async () => {
    expect(await runLimited([], 4, async () => 1)).toEqual([]);
  });
});
