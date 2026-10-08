import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, stubApi } from "@/test/api-mock";
import { makeAdminOrder } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { AdminOrderView, OrdersTable } from "./orders-views";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/orders",
}));

const summary = {
  number: "LK-ABCD2345",
  status: "paid" as const,
  created_at: "2026-10-08T10:00:00Z",
  currency: "USD",
  total_cents: 7497,
  item_count: 2,
  customer_email: "ada@example.com",
  customer_name: "Ada Lovelace",
  payment_status: "succeeded",
};

beforeEach(() => {
  replace.mockClear();
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "a@b.co", full_name: "Admin", role: "admin" },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("OrdersTable", () => {
  it("lists orders with customer, status and total", async () => {
    stubApi({
      "GET /api/v1/admin/orders": {
        body: { items: [summary, { ...summary, number: "LK-ZZZZ9999", status: "pending" }], total: 2, page: 1, page_size: 25, pages: 1 },
      },
    });
    renderWithQuery(<OrdersTable params={{ q: "", status: "all", page: 1 }} />);

    const table = await screen.findByRole("table", { name: "Orders, newest first" });
    const [first, second] = within(table).getAllByRole("row").slice(1);
    expect(within(first!).getByRole("link", { name: "LK-ABCD2345" })).toHaveAttribute("href", "/admin/orders/LK-ABCD2345");
    expect(first).toHaveTextContent("Ada Lovelace");
    expect(first).toHaveTextContent("ada@example.com");
    expect(first).toHaveTextContent("Paid");
    expect(first).toHaveTextContent("$74.97");
    expect(second).toHaveTextContent("Awaiting payment");
  });

  it("filters by status through the URL", async () => {
    stubApi({ "GET /api/v1/admin/orders": { body: { items: [summary], total: 1, page: 1, page_size: 25, pages: 1 } } });
    renderWithQuery(<OrdersTable params={{ q: "", status: "all", page: 1 }} />);
    await screen.findByRole("table");

    await userEvent.selectOptions(screen.getByLabelText("Status"), "cancelled");

    expect(replace).toHaveBeenCalledWith("/admin/orders?status=cancelled");
  });

  it("has an empty state", async () => {
    stubApi({ "GET /api/v1/admin/orders": { body: { items: [], total: 0, page: 1, page_size: 25, pages: 0 } } });
    renderWithQuery(<OrdersTable params={{ q: "nobody", status: "all", page: 1 }} />);

    expect(await screen.findByText("No orders found")).toBeInTheDocument();
  });
});

describe("AdminOrderView", () => {
  it("shows the order, the customer and the payment record", async () => {
    stubApi({ "GET /api/v1/admin/orders/LK-ABCD2345": { body: makeAdminOrder() } });
    renderWithQuery(<AdminOrderView number="LK-ABCD2345" />);

    expect(await screen.findByRole("heading", { name: "Order LK-ABCD2345" })).toBeInTheDocument();
    expect(await screen.findByText(/account #3/)).toBeInTheDocument();
    expect(screen.getByText("succeeded via offline")).toBeInTheDocument();
    expect(screen.getByText("pi_offline_123")).toBeInTheDocument();
    expect(screen.getByText("Alma Women Blue Kurta")).toBeInTheDocument();
  });

  it("explains a cancelled order", async () => {
    stubApi({
      "GET /api/v1/admin/orders/LK-ABCD2345": {
        body: makeAdminOrder({
          status: "cancelled",
          cancel_reason: "expired",
          cancelled_at: "2026-10-08T11:00:00Z",
          payment: null,
        }),
      },
    });
    renderWithQuery(<AdminOrderView number="LK-ABCD2345" />);

    expect(await screen.findByText(/expired/)).toBeInTheDocument();
    expect(screen.getByText("No payment started")).toBeInTheDocument();
  });

  it("says when there is no such order", async () => {
    stubApi({ "GET /api/v1/admin/orders/LK-ABCD2345": json({ title: "Order not found", status: 404 }, 404) });
    renderWithQuery(<AdminOrderView number="LK-ABCD2345" />);

    expect(await screen.findByText("There is no such order.")).toBeInTheDocument();
  });
});
