import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { respond, problem, stubApi } from "@/test/api-mock";
import { makeStats } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { AdminDashboard, share } from "./dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin" }));

beforeEach(() => {
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "a@b.co", full_name: "Admin", role: "admin", avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

const kpi = (name: string) =>
  within(screen.getByLabelText(/Key figures/)).getByText(name, { selector: "dt" }).closest("div")!;

describe("AdminDashboard", () => {
  it("asks for the period in the URL and shows the key figures against the one before", async () => {
    const api = stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
    await screen.findByText("$1,500");
    expect(api.calls[0]?.search).toBe("?days=7");
    expect(kpi("Revenue")).toHaveTextContent("Up 50%");
    expect(kpi("Revenue")).toHaveTextContent("vs previous 7 days");
    expect(kpi("Orders")).toHaveTextContent("Unchanged");
    expect(kpi("Average order")).toHaveTextContent("$125");
    expect(kpi("Average order")).toHaveTextContent("Up 50%");
    expect(kpi("New customers")).toHaveTextContent("Down 100%");
  });

  it("explains a figure that has nothing to compare with", async () => {
    stubApi({
      "GET /api/v1/admin/stats": respond(
        makeStats({ new_customers: { current: 3, previous: 0 }, orders: { current: 0, previous: 0 } }),
      ),
    });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    await screen.findByText("$1,500");
    expect(kpi("New customers")).toHaveTextContent("nothing in the period before");
    expect(kpi("Orders")).toHaveTextContent("No sales in either period");
  });

  it("switches period with links, and marks the current one", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats({ days: 90 })) });
    renderWithQuery(<AdminDashboard period={{ days: 90 }} />);
    await screen.findByText("$1,500");

    const period = within(screen.getByRole("navigation", { name: "Period" }));
    expect(period.getByRole("link", { name: "90 days" })).toHaveAttribute("aria-current", "page");
    expect(period.getByRole("link", { name: "30 days" })).toHaveAttribute("href", "/admin");
    expect(period.getByRole("link", { name: "7 days" })).toHaveAttribute("href", "/admin?days=7");
  });

  it("draws the revenue as a chart with the same numbers as a table", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const chart = await screen.findByRole("img", { name: /Daily revenue over the last 7 days: \$1,500 in total/ });
    expect(chart.querySelectorAll("rect")).toHaveLength(7);
    const table = screen.getByRole("table", { name: /Revenue and orders for each day/ });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(8);
    expect(rows[4]).toHaveTextContent("Oct 4");
    expect(rows[4]).toHaveTextContent("$600");
    expect(screen.getByRole("region", { name: "Daily revenue and orders" })).toHaveAttribute("tabindex", "0");
  });

  it("lists what needs attention, each a link to the right place", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const attention = within(await screen.findByRole("region", { name: "Needs attention" }));
    expect(attention.getByRole("link", { name: "3 paid orders are waiting to ship" })).toHaveAttribute("href", "/admin/orders?status=paid");
    expect(attention.getByRole("link", { name: "2 orders are awaiting payment" })).toHaveAttribute("href", "/admin/orders?status=pending");
    expect(attention.getByRole("link", { name: "1 product is low on stock" })).toHaveAttribute("href", "/admin/products?stock=low");
    expect(attention.getByRole("link", { name: "4 products are sold out" })).toHaveAttribute("href", "/admin/products?stock=out");
  });

  it("says when nothing needs attention", async () => {
    stubApi({
      "GET /api/v1/admin/stats": respond(
        makeStats({ to_ship: 0, awaiting_payment: 0, low_stock_total: 0, out_of_stock_total: 0, low_stock: [] }),
      ),
    });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    expect(await screen.findByText(/all caught up/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Low on stock/ })).not.toBeInTheDocument();
  });

  it("shows recent orders, top products and low stock with links to them", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const recent = await screen.findByRole("region", { name: "Recent orders" });
    expect(within(recent).getByRole("link", { name: "LK-ABCD2345" })).toHaveAttribute("href", "/admin/orders/LK-ABCD2345");
    expect(within(recent).getByText("Paid")).toBeInTheDocument();
    const top = screen.getByRole("region", { name: "Top products, 7 days" });
    expect(within(top).getByRole("link", { name: "Alma Women Blue Kurta" })).toHaveAttribute("href", "/admin/products/41885");
    expect(top).toHaveTextContent("9 sold");
    const low = screen.getByRole("region", { name: "Low on stock (5 or fewer)" });
    expect(within(low).getByRole("link", { name: "Slim Fit Chinos" })).toBeInTheDocument();
    expect(low).toHaveTextContent("2 left");
  });

  it("has empty states for a shop with no sales", async () => {
    stubApi({
      "GET /api/v1/admin/stats": respond(makeStats({ recent_orders: [], top_products: [] })),
    });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    expect(await screen.findByText("No orders yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing sold in this period.")).toBeInTheDocument();
  });

  it("shows units, repeat buyers and a trend line under the figures that have a history", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    const { container } = renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    await screen.findByText("$1,500");
    expect(kpi("Units sold")).toHaveTextContent("20");
    expect(kpi("Units sold")).toHaveTextContent("Up 33%");
    expect(kpi("Repeat buyers")).toHaveTextContent("25%");
    expect(kpi("Repeat buyers")).toHaveTextContent("Buyers with 2 or more orders");
    expect(container.querySelectorAll('svg[viewBox="0 0 100 28"]')).toHaveLength(4);
  });

  it("says there were no purchases rather than showing 0% repeat buyers", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats({ repeat_customer_rate: null })) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    await screen.findByText("$1,500");
    expect(kpi("Repeat buyers")).toHaveTextContent("–");
    expect(kpi("Repeat buyers")).toHaveTextContent("No purchases");
  });

  it("shows how far the period's orders got, with the share of those placed", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const funnel = within(await screen.findByRole("region", { name: "Order funnel" }));
    const steps = funnel.getAllByRole("listitem").map((item) => item.textContent);
    expect(steps).toEqual(["Placed20", "Paid1680%", "Shipped1260%", "Delivered945%", "Cancelled315%", "Refunded15%"]);
  });

  it("shows the operations figures, flags overdue orders and links to them", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const ops = within(await screen.findByRole("region", { name: "Operations" }));
    expect(ops.getByRole("link", { name: "Overdue to ship" })).toHaveAttribute("href", "/admin/orders?status=paid");
    expect(ops.getByText("Paid more than 24 h ago")).toBeInTheDocument();
    expect(ops.getByText("6.5 h")).toBeInTheDocument();
    expect(ops.getByText("6.3%")).toBeInTheDocument();
    expect(ops.getByText("15%")).toBeInTheDocument();
  });

  it("has no link and 'No data' when nothing is overdue or shipped", async () => {
    stubApi({
      "GET /api/v1/admin/stats": respond(
        makeStats({ overdue_to_ship: 0, avg_ship_hours: null, refund_rate: null, cancel_rate: null }),
      ),
    });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const ops = within(await screen.findByRole("region", { name: "Operations" }));
    expect(ops.queryByRole("link")).not.toBeInTheDocument();
    expect(ops.getAllByText("No data")).toHaveLength(3);
  });

  it("splits sales by category with the rest under Other", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const categories = within(await screen.findByRole("region", { name: "Sales by category" }));
    expect(categories.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Apparel$90067%",
      "Footwear$40030%",
      "Other$504%",
    ]);
  });

  it("lists the latest staff actions with a link to the whole log", async () => {
    stubApi({
      "GET /api/v1/admin/stats": respond(makeStats()),
      "GET /api/v1/admin/audit": respond({
        items: [
          {
            id: 9,
            actor_id: 2,
            actor_label: "worker@example.com",
            action: "order.ship",
            entity_type: "order",
            entity_id: "LK-ABCD2345",
            data: { carrier: "DHL", tracking_number: "JD1" },
            created_at: "2026-11-25T07:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 25,
        pages: 1,
      }),
    });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    const activity = within(await screen.findByRole("region", { name: "Recent staff activity" }));
    expect(await activity.findByText("worker@example.com")).toBeInTheDocument();
    expect(activity.getByText("Shipped an order")).toBeInTheDocument();
    expect(activity.getByRole("link", { name: "LK-ABCD2345" })).toHaveAttribute("href", "/admin/orders/LK-ABCD2345");
    expect(activity.getByRole("link", { name: "Full log" })).toHaveAttribute("href", "/admin/activity");
  });

  it("offers presets up to a year and a custom range that goes to the URL", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats({ days: 25 })) });
    renderWithQuery(<AdminDashboard period={{ days: 25, start: "2026-11-01", end: "2026-11-25" }} />);
    await screen.findByText("$1,500");

    const period = within(screen.getByRole("navigation", { name: "Period" }));
    expect(period.getByRole("link", { name: "1 year" })).toHaveAttribute("href", "/admin?days=365");
    expect(period.getByRole("link", { name: "Custom" })).toHaveAttribute("aria-current", "page");
    const form = screen.getByRole("form", { name: "Custom period" });
    expect(form).toHaveAttribute("method", "get");
    expect(within(form).getByLabelText("From")).toHaveValue("2026-11-01");
    expect(within(form).getByLabelText("To")).toHaveValue("2026-11-25");
  });

  it("asks for a custom range with start and end", async () => {
    const api = stubApi({ "GET /api/v1/admin/stats": respond(makeStats({ days: 25 })) });
    renderWithQuery(<AdminDashboard period={{ days: 25, start: "2026-11-01", end: "2026-11-25" }} />);

    await screen.findByText("$1,500");
    expect(api.calls[0]?.search).toBe("?start=2026-11-01&end=2026-11-25");
  });

  it("reports a failure and can try again", async () => {
    stubApi({ "GET /api/v1/admin/stats": problem(500, "Boom") });
    renderWithQuery(<AdminDashboard period={{ days: 7 }} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("share", () => {
  it("rounds to a whole percent, and never shows 0% for something that is not zero", () => {
    expect(share(1, 3)).toBe("33%");
    expect(share(90, 135)).toBe("67%");
    expect(share(1, 1000)).toBe("<1%");
    expect(share(0, 1000)).toBe("0%");
    expect(share(5, 0)).toBeUndefined();
  });
});
