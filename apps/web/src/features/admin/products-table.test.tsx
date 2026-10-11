import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, stubApi } from "@/test/api-mock";
import { makeAdminProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import type { ProductListParams } from "./admin-api";
import { ProductsTable } from "./products-table";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/products",
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const params: ProductListParams = { q: "", status: "all", sort: "newest", page: 1 };
const onSale = makeAdminProduct({ id: 7, name: "Linen camp shirt", price_cents: 4999 });
const withdrawn = makeAdminProduct({ id: 8, name: "Wool coat", is_active: false, stock_quantity: 0 });
const page = (items = [onSale, withdrawn]) => ({
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
    user: { id: 1, email: "a@b.co", full_name: "Ada", role: "admin", avatar_url: null, has_password: true, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("ProductsTable", () => {
  it("lists products with price, stock and status", async () => {
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={params} />);

    const table = await screen.findByRole("table", { name: "Products" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Linen camp shirt");
    expect(rows[0]).toHaveTextContent("$49.99");
    expect(rows[0]).toHaveTextContent("On sale");
    expect(rows[1]).toHaveTextContent("Withdrawn");
    expect(within(rows[1]!).getByRole("button", { name: "Restore Wool coat" })).toBeInTheDocument();
  });

  it("asks the API for the filters in the URL", async () => {
    const api = stubApi({ "GET /api/v1/admin/products": { body: page([]) } });
    renderWithQuery(<ProductsTable params={{ q: "shirt", status: "inactive", sort: "price_asc", page: 3 }} />);

    await screen.findByText("No products found");
    const search = new URLSearchParams(api.calls[0]!.search);
    expect(Object.fromEntries(search)).toMatchObject({ q: "shirt", status: "inactive", sort: "price_asc", page: "3" });
    expect(api.calls[0]!.headers.get("authorization")).toBe("Bearer t");
  });

  it("puts a changed filter in the URL and resets to the first page", async () => {
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={{ ...params, page: 2 }} />);
    await screen.findByRole("table");

    await userEvent.selectOptions(screen.getByLabelText("Show"), "inactive");

    expect(replace).toHaveBeenCalledWith("/admin/products?status=inactive");
  });

  it("searches when the form is submitted", async () => {
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={params} />);
    await screen.findByRole("table");

    await userEvent.type(screen.getByLabelText("Search by name or id"), "camp shirt{enter}");

    expect(replace).toHaveBeenCalledWith("/admin/products?q=camp+shirt");
  });

  it("withdraws a product only after confirmation", async () => {
    const api = stubApi({
      "GET /api/v1/admin/products": { body: page() },
      "POST /api/v1/admin/products/7/deactivate": { body: { ...onSale, is_active: false } },
    });
    renderWithQuery(<ProductsTable params={params} />);

    await userEvent.click(await screen.findByRole("button", { name: "Withdraw Linen camp shirt" }));
    const dialog = await screen.findByRole("dialog", { name: "Withdraw this product?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Keep it on sale" }));
    expect(api.count("POST /api/v1/admin/products/7/deactivate")).toBe(0);

    await userEvent.click(screen.getByRole("button", { name: "Withdraw Linen camp shirt" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(api.count("POST /api/v1/admin/products/7/deactivate")).toBe(1));
    // The list is refreshed afterwards so the row shows its new state.
    await waitFor(() => expect(api.count("GET /api/v1/admin/products")).toBe(2));
  });

  it("restores a withdrawn product straight away", async () => {
    const api = stubApi({
      "GET /api/v1/admin/products": { body: page() },
      "POST /api/v1/admin/products/8/activate": { body: { ...withdrawn, is_active: true } },
    });
    renderWithQuery(<ProductsTable params={params} />);

    await userEvent.click(await screen.findByRole("button", { name: "Restore Wool coat" }));

    await waitFor(() => expect(api.count("POST /api/v1/admin/products/8/activate")).toBe(1));
  });

  it("says why the list failed and can retry", async () => {
    let attempts = 0;
    stubApi({
      "GET /api/v1/admin/products": () => {
        attempts += 1;
        return attempts === 1 ? json({ title: "Forbidden", status: 403 }, 403) : { body: page() };
      },
    });
    renderWithQuery(<ProductsTable params={params} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't allowed");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("does not ask the API anything for a customer", () => {
    useAuth.setState({ user: { id: 1, email: "a@b.co", full_name: "Ada", role: "customer", avatar_url: null, has_password: true, providers: [] as string[] } });
    const api = stubApi({});
    renderWithQuery(<ProductsTable params={params} />);

    expect(api.calls).toHaveLength(0);
  });
});
