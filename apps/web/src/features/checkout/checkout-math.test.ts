import { describe, expect, it } from "vitest";
import type { ShippingMethods } from "./checkout-api";
import { shippingCostFor } from "./checkout-math";

/** Улаанбаатарын хүргэлтийн жагсаалт (төгрөг x 100). */
export const methods: ShippingMethods = {
  currency: "MNT",
  free_shipping_threshold_cents: 15_000_000,
  items: [
    { id: "standard", label: "Энгийн хүргэлт", description: "Улаанбаатарт гэрт нь хүргэнэ", price_cents: 500_000, estimated_days: "1-2 ажлын өдөр" },
    { id: "express", label: "Шуурхай хүргэлт", description: "Улаанбаатарт өдөртөө", price_cents: 1_200_000, estimated_days: "Өдөртөө" },
    { id: "pickup", label: "Дэлгүүрээс авах", description: "Бага тойруу 1", price_cents: 0, estimated_days: "Захиалга бэлэн болмогц" },
  ],
};

/** Орон нутгийн жагсаалт: шуурхай хүргэлтгүй. */
export const ruralMethods: ShippingMethods = {
  ...methods,
  items: [
    { ...methods.items[0]!, price_cents: 1_000_000, description: "Орон нутгийн тээврийн компаниар хүргэнэ", estimated_days: "2-5 ажлын өдөр" },
    methods.items[2]!,
  ],
};

describe("shippingCostFor", () => {
  it("charges the listed price below the threshold", () => {
    expect(shippingCostFor(methods, "standard", 14_999_999)).toBe(500_000);
  });

  it("makes standard shipping free from the threshold, but never express", () => {
    expect(shippingCostFor(methods, "standard", 15_000_000)).toBe(0);
    expect(shippingCostFor(methods, "express", 50_000_000)).toBe(1_200_000);
  });

  it("makes pickup free", () => {
    expect(shippingCostFor(methods, "pickup", 100)).toBe(0);
  });

  it("is zero for a method the zone does not offer", () => {
    expect(shippingCostFor(ruralMethods, "express", 100)).toBe(0);
  });
});
