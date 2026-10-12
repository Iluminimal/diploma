import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { methods } from "@/features/checkout/checkout-math.test";
import { problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { DeliveryInfo } from "./delivery-info";

afterEach(() => vi.unstubAllGlobals());

describe("DeliveryInfo", () => {
  it("lists each method with its time and price, and when standard is free", async () => {
    stubApi({ "GET /api/v1/checkout/shipping-methods": { body: methods } });
    renderWithQuery(<DeliveryInfo />);

    expect(await screen.findByText("Standard shipping")).toBeInTheDocument();
    expect(screen.getByText(/3-5 business days/)).toBeInTheDocument();
    expect(screen.getByText("$4.99")).toBeInTheDocument();
    expect(screen.getByText(/free over/)).toHaveTextContent("free over $100");
    expect(screen.getByText("Express shipping")).toBeInTheDocument();
    expect(screen.getByText("$12.99")).toBeInTheDocument();
  });

  it("falls back to a pointer to checkout when the prices cannot be loaded", async () => {
    stubApi({ "GET /api/v1/checkout/shipping-methods": problem(500, "Server error") });
    renderWithQuery(<DeliveryInfo />);

    expect(await screen.findByText(/shown at checkout/)).toBeInTheDocument();
  });
});
