import { screen, waitFor, within } from "@testing-library/react";
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
    user: { id: 1, email: "a@b.co", full_name: "Admin", role: "admin", avatar_url: null, has_password: true, providers: [] as string[] },
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

  it("has a tab for each status, with how many orders are in it", async () => {
    stubApi({
      "GET /api/v1/admin/orders": {
        body: {
          items: [summary],
          total: 1,
          page: 1,
          page_size: 25,
          pages: 1,
          status_counts: { paid: 3, shipped: 2, pending: 1 },
        },
      },
    });
    renderWithQuery(<OrdersTable params={{ q: "", status: "paid", page: 1 }} />);
    await screen.findByRole("table");

    const tabs = within(screen.getByRole("navigation", { name: "Order status" }));
    expect(tabs.getByRole("link", { name: "All 6" })).toHaveAttribute("href", "/admin/orders");
    expect(tabs.getByRole("link", { name: "To ship 3" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "To ship 3" })).toHaveAttribute("href", "/admin/orders?status=paid");
    expect(tabs.getByRole("link", { name: "Shipped 2" })).toHaveAttribute("href", "/admin/orders?status=shipped");
    expect(tabs.getByRole("link", { name: "Refunded 0" })).toBeInTheDocument();
  });

  it("keeps the search when switching tabs", async () => {
    stubApi({ "GET /api/v1/admin/orders": { body: { items: [summary], total: 1, page: 3, page_size: 25, pages: 3, status_counts: {} } } });
    renderWithQuery(<OrdersTable params={{ q: "ada", status: "all", page: 3 }} />);
    await screen.findByRole("table");

    expect(screen.getByRole("link", { name: /^Delivered/ })).toHaveAttribute("href", "/admin/orders?q=ada&status=delivered");
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

  it("shows where the order is on its way, and offers what can be done next", async () => {
    stubApi({ "GET /api/v1/admin/orders/LK-ABCD2345": { body: makeAdminOrder({ status: "paid" }) } });
    renderWithQuery(<AdminOrderView number="LK-ABCD2345" />);

    await screen.findByRole("heading", { name: "Order LK-ABCD2345" });
    expect(await screen.findByRole("list", { name: "Order progress" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as shipped" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refund" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All orders" })).toHaveAttribute("href", "/admin/orders");
  });

  it("shows the tracking of a shipment and the history, including internal notes", async () => {
    stubApi({
      "GET /api/v1/admin/orders/LK-ABCD2345": {
        body: makeAdminOrder({
          status: "shipped",
          shipped_at: "2026-10-09T09:00:00Z",
          carrier: "DHL",
          tracking_number: "JD0146",
          events: [
            { type: "placed", at: "2026-10-08T10:00:00Z", data: {} },
            { type: "shipped", at: "2026-10-09T09:00:00Z", data: { carrier: "DHL", tracking_number: "JD0146", actor: "admin@example.com" } },
            { type: "note", at: "2026-10-09T10:00:00Z", data: { text: "Gift box please", actor: "admin@example.com" } },
          ],
        }),
      },
    });
    renderWithQuery(<AdminOrderView number="LK-ABCD2345" />);

    const shipment = within(await screen.findByRole("region", { name: "Shipment" }));
    expect(shipment.getByText("DHL")).toBeInTheDocument();
    expect(shipment.getByText("JD0146")).toBeInTheDocument();
    const history = within(screen.getByRole("region", { name: "History" }));
    expect(history.getByText("Gift box please")).toBeInTheDocument();
    expect(history.getByText("Order placed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as delivered" })).toBeInTheDocument();
  });

  it("adds a note to the history", async () => {
    const api = stubApi({
      "GET /api/v1/admin/orders/LK-ABCD2345": { body: makeAdminOrder() },
      "POST /api/v1/admin/orders/LK-ABCD2345/notes": { body: makeAdminOrder() },
    });
    renderWithQuery(<AdminOrderView number="LK-ABCD2345" />);

    const add = await screen.findByRole("button", { name: "Add note" });
    expect(add).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Add a note"), "  Call before delivery ");
    await userEvent.click(add);

    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ text: "Call before delivery" });
    await waitFor(() => expect(screen.getByLabelText("Add a note")).toHaveValue(""));
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
