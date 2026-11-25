import { describe, expect, it } from "vitest";
import { landingPath } from "./landing";

describe("landingPath", () => {
  it("sends an administrator with no particular destination to the admin area", () => {
    expect(landingPath("/", "admin")).toBe("/admin");
  });

  it("sends a warehouse worker with no particular destination to the warehouse board", () => {
    expect(landingPath("/", "warehouse")).toBe("/admin");
  });

  it("keeps the page a warehouse worker asked for", () => {
    expect(landingPath("/admin/orders", "warehouse")).toBe("/admin/orders");
    expect(landingPath("/account/orders", "warehouse")).toBe("/account/orders");
  });

  it("keeps the page an administrator asked for", () => {
    expect(landingPath("/account/orders", "admin")).toBe("/account/orders");
    expect(landingPath("/admin/orders", "admin")).toBe("/admin/orders");
  });

  it("sends customers and unknown roles home", () => {
    expect(landingPath("/", "customer")).toBe("/");
    expect(landingPath("/", undefined)).toBe("/");
    expect(landingPath("/cart", "customer")).toBe("/cart");
  });
});
