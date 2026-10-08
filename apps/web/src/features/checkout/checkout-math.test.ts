import { describe, expect, it } from "vitest";
import type { ShippingMethods } from "./checkout-api";
import { shippingCostFor } from "./checkout-math";

export const methods: ShippingMethods = {
  currency: "USD",
  free_shipping_threshold_cents: 10_000,
  items: [
    { id: "standard", label: "Standard shipping", description: "Tracked delivery", price_cents: 499, estimated_days: "3-5 business days" },
    { id: "express", label: "Express shipping", description: "Priority handling", price_cents: 1299, estimated_days: "1-2 business days" },
  ],
};

describe("shippingCostFor", () => {
  it("charges the listed price below the threshold", () => {
    expect(shippingCostFor(methods, "standard", 9_999)).toBe(499);
  });

  it("makes standard shipping free from the threshold, but never express", () => {
    expect(shippingCostFor(methods, "standard", 10_000)).toBe(0);
    expect(shippingCostFor(methods, "express", 50_000)).toBe(1299);
  });

  it("is zero for an unknown method", () => {
    expect(shippingCostFor({ ...methods, items: [] }, "express", 100)).toBe(0);
  });
});
