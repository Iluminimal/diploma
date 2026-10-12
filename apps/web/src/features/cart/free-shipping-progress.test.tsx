import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { methods } from "@/features/checkout/checkout-math.test";
import { stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { FreeShippingProgress } from "./free-shipping-progress";

afterEach(() => vi.unstubAllGlobals());

const route = { "GET /api/v1/checkout/shipping-methods": { body: methods } };

describe("FreeShippingProgress", () => {
  it("says how far the subtotal is from free shipping and fills the bar", async () => {
    stubApi(route);
    renderWithQuery(<FreeShippingProgress subtotalCents={6_000} />);

    expect(await screen.findByText("$40")).toBeInTheDocument(); // $100 threshold - $60
    expect(screen.getByRole("status")).toHaveTextContent("away from free shipping");
    const bar = screen.getByRole("progressbar", { name: "Progress to free shipping" });
    expect(bar).toHaveAttribute("aria-valuenow", "60");
  });

  it("congratulates once the threshold is reached", async () => {
    stubApi(route);
    renderWithQuery(<FreeShippingProgress subtotalCents={12_000} />);

    expect(await screen.findByText("You've unlocked free shipping")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("shows nothing until the threshold is known", () => {
    stubApi({ "GET /api/v1/checkout/shipping-methods": () => new Promise<never>(() => {}) });
    renderWithQuery(<FreeShippingProgress subtotalCents={6_000} />);

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
