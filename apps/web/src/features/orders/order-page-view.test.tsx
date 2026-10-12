import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { problem, respond, stubApi } from "@/test/api-mock";
import { makeOrder } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { OrderPageView } from "./order-page-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/account/orders/LK-ABCD2345" }));

const delivered = makeOrder({
  status: "delivered",
  shipped_at: "2026-10-09T09:00:00Z",
  delivered_at: "2026-10-11T14:00:00Z",
  carrier: "DHL",
  tracking_number: "JD0146",
  events: [
    { type: "placed", at: "2026-10-08T10:00:00Z", data: {} },
    { type: "paid", at: "2026-10-08T10:00:05Z", data: {} },
    { type: "shipped", at: "2026-10-09T09:00:00Z", data: { carrier: "DHL", tracking_number: "JD0146" } },
    { type: "delivered", at: "2026-10-11T14:00:00Z", data: {} },
  ],
});

beforeEach(() => {
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "a@b.co", full_name: "Ada", role: "customer", avatar_url: null, has_password: true, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("OrderPageView", () => {
  it("shows how far the order has got, where it is, and what happened", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": respond(delivered) });
    renderWithQuery(<OrderPageView number="LK-ABCD2345" />);

    const progress = await screen.findByRole("list", { name: "Order progress" });
    expect(within(progress).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("JD0146", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/Tracking with DHL/)).toBeInTheDocument();
    const history = within(screen.getByRole("list", { name: "Order history" }));
    expect(history.getAllByRole("listitem").map((item) => item.querySelector("p")?.textContent)).toEqual([
      "Order placed",
      "Payment received",
      "Shipped",
      "Delivered",
    ]);
    expect(history.getByText("Tracking number JD0146")).toBeInTheDocument();
  });

  it("offers a review of each item once the order has been delivered", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": respond(delivered) });
    renderWithQuery(<OrderPageView number="LK-ABCD2345" />);

    const link = await screen.findByRole("link", { name: "Write a review for Alma Women Blue Kurta" });
    expect(link).toHaveAttribute("href", "/products/41885/alma-women-blue-kurta-60000#reviews");
  });

  it("does not offer reviews before it has arrived", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": respond(makeOrder({ status: "shipped", shipped_at: "2026-10-09T09:00:00Z" })) });
    renderWithQuery(<OrderPageView number="LK-ABCD2345" />);

    await screen.findByRole("list", { name: "Order progress" });
    expect(screen.queryByRole("link", { name: /Write a review/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Tracking with/)).not.toBeInTheDocument();
  });

  it("ends a cancelled order at the cancellation, with its date from the history", async () => {
    stubApi({
      "GET /api/v1/orders/LK-ABCD2345": respond(
        makeOrder({
          status: "cancelled",
          paid_at: null,
          events: [
            { type: "placed", at: "2026-10-08T10:00:00Z", data: {} },
            { type: "cancelled", at: "2026-10-08T11:00:00Z", data: { reason: "expired" } },
          ],
        }),
      ),
    });
    renderWithQuery(<OrderPageView number="LK-ABCD2345" />);

    const steps = within(await screen.findByRole("list", { name: "Order progress" })).getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveTextContent("Cancelled");
    expect(steps[1]).toHaveTextContent("Oct 8");
    expect(screen.getByText("Not paid in time")).toBeInTheDocument();
  });

  it("says when the order is not on this account", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": problem(404, "Order not found") });
    renderWithQuery(<OrderPageView number="LK-ABCD2345" />);

    expect(await screen.findByText(/couldn't find that order/)).toBeInTheDocument();
  });
});
