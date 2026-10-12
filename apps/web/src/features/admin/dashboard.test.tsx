import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { respond, problem, stubApi } from "@/test/api-mock";
import { makeStats } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { AdminDashboard } from "./dashboard";

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
    renderWithQuery(<AdminDashboard days={7} />);

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
    renderWithQuery(<AdminDashboard days={7} />);

    await screen.findByText("$1,500");
    expect(kpi("New customers")).toHaveTextContent("nothing in the period before");
    expect(kpi("Orders")).toHaveTextContent("No sales in either period");
  });

  it("switches period with links, and marks the current one", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats({ days: 90 })) });
    renderWithQuery(<AdminDashboard days={90} />);
    await screen.findByText("$1,500");

    const period = within(screen.getByRole("navigation", { name: "Period" }));
    expect(period.getByRole("link", { name: "90 days" })).toHaveAttribute("aria-current", "page");
    expect(period.getByRole("link", { name: "30 days" })).toHaveAttribute("href", "/admin");
    expect(period.getByRole("link", { name: "7 days" })).toHaveAttribute("href", "/admin?days=7");
  });

  it("draws the revenue as a chart with the same numbers as a table", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard days={7} />);

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
    renderWithQuery(<AdminDashboard days={7} />);

    const attention = within(await screen.findByRole("region", { name: "Needs attention" }));
    expect(attention.getByRole("link", { name: "3 paid orders are waiting to ship" })).toHaveAttribute("href", "/admin/orders?status=paid");
    expect(attention.getByRole("link", { name: "2 orders are awaiting payment" })).toHaveAttribute("href", "/admin/orders?status=pending");
    expect(attention.getByRole("link", { name: "1 product is low on stock" })).toHaveAttribute("href", "/admin/inventory?stock=low");
    expect(attention.getByRole("link", { name: "4 products are sold out" })).toHaveAttribute("href", "/admin/inventory?stock=out");
  });

  it("says when nothing needs attention", async () => {
    stubApi({
      "GET /api/v1/admin/stats": respond(
        makeStats({ to_ship: 0, awaiting_payment: 0, low_stock_total: 0, out_of_stock_total: 0, low_stock: [] }),
      ),
    });
    renderWithQuery(<AdminDashboard days={7} />);

    expect(await screen.findByText(/all caught up/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Low on stock/ })).not.toBeInTheDocument();
  });

  it("shows recent orders, top products and low stock with links to them", async () => {
    stubApi({ "GET /api/v1/admin/stats": respond(makeStats()) });
    renderWithQuery(<AdminDashboard days={7} />);

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
    renderWithQuery(<AdminDashboard days={7} />);

    expect(await screen.findByText("No orders yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing sold in this period.")).toBeInTheDocument();
  });

  it("reports a failure and can try again", async () => {
    stubApi({ "GET /api/v1/admin/stats": problem(500, "Boom") });
    renderWithQuery(<AdminDashboard days={7} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
