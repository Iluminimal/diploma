import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { signInAs } from "@/test/auth";
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

const params: ProductListParams = { q: "", status: "all", stock: "all", sort: "newest", page: 1 };
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
  signInAs("warehouse");
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
    renderWithQuery(<ProductsTable params={{ q: "shirt", status: "inactive", stock: "all", sort: "price_asc", page: 3 }} />);

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
    // Дараа нь жагсаалт шинэчлэгдэж, мөр шинэ төлвөө харуулна.
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

  it("makes the price and stock headers sort links and says the current order", async () => {
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={{ ...params, sort: "price_asc" }} />);

    const table = await screen.findByRole("table", { name: "Products" });
    expect(within(table).getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "ascending");
    expect(within(table).getByRole("link", { name: "Price" })).toHaveAttribute("href", "/admin/products?sort=price_desc");
    expect(within(table).getByRole("link", { name: "Stock" })).toHaveAttribute("href", "/admin/products?sort=stock_asc");
  });

  it("withdraws several products at once from the selection bar, after confirmation", async () => {
    const other = makeAdminProduct({ id: 9, name: "Denim jacket" });
    const api = stubApi({
      "GET /api/v1/admin/products": { body: page([onSale, withdrawn, other]) },
      "POST /api/v1/admin/products/7/deactivate": { body: { ...onSale, is_active: false } },
      "POST /api/v1/admin/products/9/deactivate": { body: { ...other, is_active: false } },
    });
    renderWithQuery(<ProductsTable params={params} />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Linen camp shirt" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select Denim jacket" }));

    const bar = within(screen.getByRole("region", { name: "2 selected" }));
    await userEvent.click(bar.getByRole("button", { name: "Withdraw" }));
    const dialog = await screen.findByRole("dialog", { name: "Withdraw 2 products?" });
    expect(api.count("POST /api/v1/admin/products/7/deactivate")).toBe(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(api.count("POST /api/v1/admin/products/7/deactivate")).toBe(1));
    expect(api.count("POST /api/v1/admin/products/9/deactivate")).toBe(1);
    await waitFor(() => expect(screen.queryByRole("region", { name: /selected/ })).not.toBeInTheDocument());
  });

  it("offers Restore, not Withdraw, when only withdrawn products are selected", async () => {
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={params} />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select Wool coat" }));

    const bar = within(screen.getByRole("region", { name: "1 selected" }));
    expect(bar.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    expect(bar.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
  });

  it("switches to a photo grid and keeps the selection controls", async () => {
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={params} />);
    await screen.findByRole("table", { name: "Products" });

    await userEvent.click(screen.getByRole("button", { name: "Grid" }));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const grid = screen.getByRole("list", { name: "Products" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(2);
    expect(within(grid).getByRole("checkbox", { name: "Select Wool coat" })).toBeInTheDocument();
    expect(within(grid).getByText("Sold out")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Table" }));
  });

  it("lets an administrator look at products but not add, withdraw, restore or select them", async () => {
    signInAs("admin");
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={params} />);

    const table = await screen.findByRole("table", { name: "Products" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /Withdraw|Restore/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New product" })).not.toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "View Linen camp shirt" })).toHaveAttribute("href", "/admin/products/7");
  });

  it("offers a warehouse worker the new product link", async () => {
    stubApi({ "GET /api/v1/admin/products": { body: page() } });
    renderWithQuery(<ProductsTable params={params} />);

    await screen.findByRole("table", { name: "Products" });
    expect(screen.getByRole("link", { name: /New product/ })).toHaveAttribute("href", "/admin/products/new");
  });

  it("does not ask the API anything for a customer", () => {
    useAuth.setState({ user: { id: 1, email: "a@b.co", full_name: "Ada", role: "customer", avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] } });
    const api = stubApi({});
    renderWithQuery(<ProductsTable params={params} />);

    expect(api.calls).toHaveLength(0);
  });
});
