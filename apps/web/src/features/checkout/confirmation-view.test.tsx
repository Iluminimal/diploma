import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, problem, stubApi } from "@/test/api-mock";
import { makeOrder } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { ConfirmationView } from "./confirmation-view";

beforeEach(() =>
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "ada@example.com", full_name: "Ada" },
  }),
);
afterEach(() => vi.unstubAllGlobals());

describe("ConfirmationView", () => {
  it("thanks the shopper and shows what was bought, where it goes and what was charged", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder() } });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    expect(await screen.findByRole("heading", { name: "Thank you for your order" })).toBeInTheDocument();
    expect(screen.getByText("LK-ABCD2345")).toBeInTheDocument();
    expect(screen.getByText("Alma Women Blue Kurta")).toBeInTheDocument();
    expect(screen.getByText(/12 Analytical Way/)).toBeInTheDocument();
    expect(screen.getByText("$74.97")).toBeInTheDocument(); // 2 x 34.99 + 4.99
    expect(screen.getAllByText(/ada@example.com/).length).toBeGreaterThan(0);
  });

  it("keeps checking while the payment is still being confirmed", async () => {
    const api = stubApi({
      "GET /api/v1/orders/LK-ABCD2345": () => json(makeOrder({ status: api.count("GET /api/v1/orders/LK-ABCD2345") > 1 ? "paid" : "pending" })),
    });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    expect(await screen.findByRole("heading", { name: /Confirming your payment/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Thank you for your order" })).toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  it("says so when the order was cancelled", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder({ status: "cancelled", paid_at: null }) } });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    expect(await screen.findByRole("heading", { name: "This order was cancelled" })).toBeInTheDocument();
  });

  it("does not reveal whether someone else's order exists", async () => {
    stubApi({
      "GET /api/v1/orders/LK-OTHER000": problem(404, "Order not found", { type: "urn:lookalike:problem:order-not-found" }),
    });
    renderWithQuery(<ConfirmationView number="LK-OTHER000" />);

    expect(await screen.findByRole("heading", { name: /couldn't find that order/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your orders" })).toHaveAttribute("href", "/account/orders");
  });
});
