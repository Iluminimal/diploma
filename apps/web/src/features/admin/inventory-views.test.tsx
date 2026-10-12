import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { respond, problem, stubApi } from "@/test/api-mock";
import { makeAdminProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import type { ProductListParams } from "./admin-api";
import { InventoryTable } from "./inventory-views";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/inventory",
}));

const params: ProductListParams = { q: "", status: "active", stock: "all", sort: "stock_asc", page: 1 };
const page = (items = [makeAdminProduct({ stock_quantity: 0 }), makeAdminProduct({ id: 8, name: "Wool scarf", stock_quantity: 3 })]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 25,
  pages: 1,
});

beforeEach(() => {
  replace.mockClear();
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "a@b.co", full_name: "Admin", role: "admin", avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("InventoryTable", () => {
  it("asks for what is on sale, lowest stock first, and filters by stock level", async () => {
    const api = stubApi({ "GET /api/v1/admin/products": respond(page([])) });
    renderWithQuery(<InventoryTable params={{ ...params, stock: "low", q: "shirt" }} />);

    await screen.findByText("Nothing is running low");
    expect(Object.fromEntries(new URLSearchParams(api.calls[0]!.search))).toMatchObject({
      status: "active",
      sort: "stock_asc",
      stock: "low",
      q: "shirt",
    });
  });

  it("has a tab for each stock level that keeps the search", async () => {
    stubApi({ "GET /api/v1/admin/products": respond(page()) });
    renderWithQuery(<InventoryTable params={{ ...params, q: "shirt" }} />);
    await screen.findByRole("table");

    const tabs = within(screen.getByRole("navigation", { name: "Stock level" }));
    expect(tabs.getByRole("link", { name: "All on sale" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Low stock" })).toHaveAttribute("href", "/admin/inventory?q=shirt&stock=low");
    expect(tabs.getByRole("link", { name: "Sold out" })).toHaveAttribute("href", "/admin/inventory?q=shirt&stock=out");
  });

  it("shows the count of each product, and says when one is sold out", async () => {
    stubApi({ "GET /api/v1/admin/products": respond(page()) });
    renderWithQuery(<InventoryTable params={params} />);

    expect(await screen.findByLabelText("Units in stock of Linen camp shirt")).toHaveValue(0);
    expect(screen.getByLabelText("Units in stock of Wool scarf")).toHaveValue(3);
    expect(within(screen.getByRole("table")).getByText("Sold out")).toBeInTheDocument();
  });

  it("saves the number typed", async () => {
    const api = stubApi({
      "GET /api/v1/admin/products": respond(page()),
      "PUT /api/v1/admin/products/8/stock": respond(makeAdminProduct({ id: 8, stock_quantity: 40 })),
    });
    renderWithQuery(<InventoryTable params={params} />);

    const input = await screen.findByLabelText("Units in stock of Wool scarf");
    await userEvent.clear(input);
    await userEvent.type(input, "40");
    await userEvent.click(within(screen.getByRole("form", { name: "Stock of Wool scarf" })).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "PUT")).toBe(true));
    expect(api.calls.find((c) => c.method === "PUT")?.body).toEqual({ quantity: 40 });
  });

  it("does not call the API for a number that is unchanged or not valid", async () => {
    const api = stubApi({ "GET /api/v1/admin/products": respond(page()) });
    renderWithQuery(<InventoryTable params={params} />);

    const input = await screen.findByLabelText("Units in stock of Wool scarf");
    const save = within(screen.getByRole("form", { name: "Stock of Wool scarf" })).getByRole("button", { name: "Save" });
    await userEvent.click(save);
    await userEvent.clear(input);
    await userEvent.type(input, "1.5");
    await userEvent.click(save);

    expect(api.calls.filter((c) => c.method === "PUT")).toHaveLength(0);
  });

  it("reports a failed save and keeps what was typed", async () => {
    const api = stubApi({
      "GET /api/v1/admin/products": respond(page()),
      "PUT /api/v1/admin/products/8/stock": problem(500, "Boom"),
    });
    renderWithQuery(<InventoryTable params={params} />);

    const input = await screen.findByLabelText("Units in stock of Wool scarf");
    await userEvent.clear(input);
    await userEvent.type(input, "9");
    await userEvent.click(within(screen.getByRole("form", { name: "Stock of Wool scarf" })).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "PUT")).toBe(true));
    await waitFor(() => expect(within(screen.getByRole("form", { name: "Stock of Wool scarf" })).getByRole("button", { name: "Save" })).toBeEnabled());
    expect(screen.getByLabelText("Units in stock of Wool scarf")).toHaveValue(9);
  });

  it("has empty states by stock level", async () => {
    stubApi({ "GET /api/v1/admin/products": respond(page([])) });
    renderWithQuery(<InventoryTable params={{ ...params, stock: "out" }} />);

    expect(await screen.findByText("Nothing is sold out")).toBeInTheDocument();
  });
});
