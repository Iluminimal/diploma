import { describe, expect, it } from "vitest";
import { createFormat } from "./format";

describe("createFormat", () => {
  it("shows prices in tugrik, whole, from minor units (tugrik x 100)", () => {
    // Хэл болон орчин (Node, хөтөч) аль нь ч адилхан: hydration таарна.
    expect(createFormat("mn").price(8_790_000)).toBe("₮87,900");
    expect(createFormat("en").price(8_790_000)).toBe("₮87,900");
    expect(createFormat("mn").price(0)).toBe("₮0");
    expect(createFormat("mn").price(123_456_789)).toBe("₮1,234,568");
  });

  it("formats another currency by its own decimals (old USD orders)", () => {
    expect(createFormat("en").price(3499, "USD")).toBe("$34.99");
    expect(createFormat("en").price(5000, "USD")).toBe("$50");
  });

  it("formats numbers, dates and comparisons by the active language", () => {
    expect(createFormat("en").number(1234567)).toBe("1,234,567");
    expect(createFormat("en").compare("a", "b")).toBeLessThan(0);
  });
});
