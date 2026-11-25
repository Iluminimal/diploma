import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { respond, problem, stubApi } from "@/test/api-mock";
import { signInAs } from "@/test/auth";
import { renderWithQuery } from "@/test/render";
import { ActivityLog } from "./activity-views";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/activity" }));

const entry = (over: Record<string, unknown> = {}) => ({
  id: 1,
  actor_id: 4,
  actor_label: "worker@example.com",
  action: "product.stock",
  entity_type: "product",
  entity_id: "7",
  data: { previous: 3, quantity: 40 },
  created_at: "2026-11-25T07:00:00Z",
  ...over,
});
const page = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 25,
  pages: 1,
  ...extra,
});
const ALL = { entity: "all", actor: 0, action: "", page: 1 } as const;

beforeEach(() => signInAs("admin"));
afterEach(() => vi.unstubAllGlobals());

describe("ActivityLog", () => {
  it("lists who did what to which object, with the details", async () => {
    const api = stubApi({
      "GET /api/v1/admin/audit": respond(
        page([
          entry(),
          entry({
            id: 2,
            action: "order.ship",
            entity_type: "order",
            entity_id: "LK-ABCD2345",
            data: { carrier: "DHL", tracking_number: "JD0146" },
          }),
          entry({ id: 3, actor_id: null, actor_label: "gone@example.com", action: "order.refund", entity_type: "order", entity_id: "LK-ZZZZ0001", data: { reason: "damaged", restock: true } }),
        ]),
      ),
    });
    renderWithQuery(<ActivityLog params={ALL} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Activity log" })).toBeInTheDocument();
    const table = within(await screen.findByRole("table"));
    const rows = table.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("worker@example.com");
    expect(rows[0]).toHaveTextContent("Set stock");
    expect(rows[0]).toHaveTextContent("3 → 40");
    expect(within(rows[0]!).getByRole("link", { name: "Product #7" })).toHaveAttribute("href", "/admin/products/7");
    expect(rows[1]).toHaveTextContent("DHL · JD0146");
    expect(within(rows[1]!).getByRole("link", { name: "LK-ABCD2345" })).toHaveAttribute("href", "/admin/orders/LK-ABCD2345");
    expect(rows[2]).toHaveTextContent("Reason: damaged · Stock returned");
    expect(api.calls[0]?.search).toBe("?page=1&page_size=25");
  });

  it("filters from the URL, and links a name or an action to the same filter", async () => {
    const api = stubApi({ "GET /api/v1/admin/audit": respond(page([entry()])) });
    renderWithQuery(<ActivityLog params={{ entity: "product", actor: 0, action: "", page: 2 }} />);

    await screen.findByRole("table");
    expect(api.calls[0]?.search).toContain("entity_type=product");
    expect(api.calls[0]?.search).toContain("page=2");
    expect(screen.getByRole("link", { name: "worker@example.com" })).toHaveAttribute("href", "/admin/activity?entity=product&actor=4");
    expect(screen.getByRole("link", { name: "Set stock" })).toHaveAttribute("href", "/admin/activity?entity=product&action=product.stock");
    const nav = within(screen.getByRole("navigation", { name: "Filter the log" }));
    expect(nav.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/admin/activity?entity=order");
  });

  it("says nothing matches a filter and offers to clear it", async () => {
    stubApi({ "GET /api/v1/admin/audit": respond(page([])) });
    renderWithQuery(<ActivityLog params={{ entity: "order", actor: 0, action: "", page: 1 }} />);

    expect(await screen.findByText("Nothing matches these filters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/admin/activity");
  });

  it("says nothing was logged yet", async () => {
    stubApi({ "GET /api/v1/admin/audit": respond(page([])) });
    renderWithQuery(<ActivityLog params={ALL} />);

    expect(await screen.findByText("Nothing has been logged yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("pages through the log", async () => {
    stubApi({ "GET /api/v1/admin/audit": respond(page([entry()], { total: 60, pages: 3, page: 2 })) });
    renderWithQuery(<ActivityLog params={{ ...ALL, page: 2 }} />);

    expect(await screen.findByRole("link", { name: /Next/ })).toHaveAttribute("href", "/admin/activity?page=3");
    expect(screen.getByRole("link", { name: /Previous/ })).toHaveAttribute("href", "/admin/activity");
  });

  it("reports a failure and can try again", async () => {
    stubApi({ "GET /api/v1/admin/audit": problem(500, "Boom") });
    renderWithQuery(<ActivityLog params={ALL} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
