import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { problem, stubApi } from "@/test/api-mock";
import { makeOrder, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { OrdersList } from "./orders-list";
import { OrderPageView } from "./order-page-view";

const summary = (number: string, status: "paid" | "pending" | "cancelled", total: number) => ({
  number,
  status,
  created_at: "2026-10-08T10:00:00Z",
  currency: "USD",
  total_cents: total,
  item_count: 2,
  images: [makeProduct().image],
});
const page = (items: ReturnType<typeof summary>[], total = items.length, pages = 1) => ({
  items,
  total,
  page: 1,
  page_size: 10,
  pages,
});

beforeEach(() =>
  useAuth.setState({ status: "signedIn", accessToken: "t", user: { id: 1, email: "a@b.co", full_name: "Ada" } }),
);
afterEach(() => vi.unstubAllGlobals());

describe("OrdersList", () => {
  it("lists orders with status, size of the order, total and a link to the detail", async () => {
    stubApi({
      "GET /api/v1/orders": {
        body: page([summary("LK-AAAA1111", "paid", 7497), summary("LK-BBBB2222", "cancelled", 1999)]),
      },
    });
    renderWithQuery(<OrdersList page={1} />);

    const first = await screen.findByRole("link", { name: /LK-AAAA1111/ });
    expect(first).toHaveAttribute("href", "/account/orders/LK-AAAA1111");
    expect(first).toHaveTextContent("Paid");
    expect(first).toHaveTextContent("2 items");
    expect(first).toHaveTextContent("$74.97");
    expect(screen.getByRole("link", { name: /LK-BBBB2222/ })).toHaveTextContent("Cancelled");
  });

  it("asks for the requested page and links to neighbouring pages", async () => {
    const api = stubApi({
      "GET /api/v1/orders": { body: { ...page([summary("LK-CCCC3333", "paid", 100)], 25, 3), page: 2 } },
    });
    renderWithQuery(<OrdersList page={2} />);

    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(api.calls[0]?.search).toContain("page=2");
    expect(screen.getByRole("link", { name: /Newer/ })).toHaveAttribute("href", "/account/orders?page=1");
    expect(screen.getByRole("link", { name: /Older/ })).toHaveAttribute("href", "/account/orders?page=3");
  });

  it("invites a first purchase when there are no orders", async () => {
    stubApi({ "GET /api/v1/orders": { body: page([]) } });
    renderWithQuery(<OrdersList page={1} />);

    expect(await screen.findByText("No orders yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start shopping" })).toHaveAttribute("href", "/products");
  });
});

describe("OrderPageView", () => {
  it("shows the order with its snapshot prices", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder() } });
    renderWithQuery(<OrderPageView number="LK-ABCD2345" />);

    expect(await screen.findByText("Alma Women Blue Kurta")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Order LK-ABCD2345" })).toBeInTheDocument();
    expect(screen.getByText("$74.97")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All orders/ })).toHaveAttribute("href", "/account/orders");
  });

  it("treats someone else's order like a missing one", async () => {
    stubApi({ "GET /api/v1/orders/LK-OTHER000": problem(404, "Order not found") });
    renderWithQuery(<OrderPageView number="LK-OTHER000" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't find that order");
  });
});
