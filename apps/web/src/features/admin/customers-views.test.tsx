import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { respond, problem, stubApi } from "@/test/api-mock";
import { makeAdminCustomer, makeAdminCustomerDetail } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import type { CustomerListParams } from "./admin-api";
import { CustomersTable, CustomerView } from "./customers-views";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/customers",
}));

const params: CustomerListParams = { q: "", status: "all", sort: "newest", page: 1 };
const page = (items = [makeAdminCustomer(), makeAdminCustomer({ id: 4, full_name: "Grace Hopper", email: "grace@example.com", orders_count: 0, total_spent_cents: 0, last_order_at: null, is_active: false })]) => ({
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
    user: { id: 1, email: "a@b.co", full_name: "Admin", role: "admin", avatar_url: null, has_password: true, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("CustomersTable", () => {
  it("lists customers with what they have bought", async () => {
    stubApi({ "GET /api/v1/admin/customers": respond(page()) });
    renderWithQuery(<CustomersTable params={params} />);

    const table = await screen.findByRole("table", { name: "Customers" });
    const [ada, grace] = within(table).getAllByRole("row").slice(1);
    expect(within(ada!).getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/admin/customers/3");
    expect(ada).toHaveTextContent("ada@example.com");
    expect(ada).toHaveTextContent("$182.50");
    expect(ada).toHaveTextContent("Active");
    expect(grace).toHaveTextContent("Never");
    expect(grace).toHaveTextContent("Suspended");
  });

  it("asks the API for the filters in the URL", async () => {
    const api = stubApi({ "GET /api/v1/admin/customers": respond(page([])) });
    renderWithQuery(<CustomersTable params={{ q: "ada", status: "inactive", sort: "spent", page: 2 }} />);

    await screen.findByText("No customers found");
    expect(Object.fromEntries(new URLSearchParams(api.calls[0]!.search))).toMatchObject({
      q: "ada",
      status: "inactive",
      sort: "spent",
      page: "2",
    });
  });

  it("puts a changed filter in the URL and goes back to the first page", async () => {
    stubApi({ "GET /api/v1/admin/customers": respond(page()) });
    renderWithQuery(<CustomersTable params={{ ...params, page: 3 }} />);
    await screen.findByRole("table");

    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "spent");

    expect(replace).toHaveBeenCalledWith("/admin/customers?sort=spent");
  });
});

describe("CustomerView", () => {
  it("shows the account, how they sign in and their orders", async () => {
    stubApi({ "GET /api/v1/admin/customers/3": respond(makeAdminCustomerDetail({ providers: ["google"] })) });
    renderWithQuery(<CustomerView id={3} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("Email and password, Google")).toBeInTheDocument();
    const orders = screen.getByRole("region", { name: "Recent orders" });
    expect(within(orders).getByRole("link", { name: "LK-ABCD2345" })).toHaveAttribute("href", "/admin/orders/LK-ABCD2345");
    expect(orders).toHaveTextContent("Delivered");
  });

  it("says when there is no such customer", async () => {
    stubApi({ "GET /api/v1/admin/customers/3": problem(404, "Customer not found") });
    renderWithQuery(<CustomerView id={3} />);

    expect(await screen.findByText("There is no such customer.")).toBeInTheDocument();
  });

  it("asks before suspending, then suspends", async () => {
    const api = stubApi({
      "GET /api/v1/admin/customers/3": respond(makeAdminCustomerDetail()),
      "POST /api/v1/admin/customers/3/deactivate": respond(makeAdminCustomerDetail({ is_active: false })),
    });
    renderWithQuery(<CustomerView id={3} />);

    await userEvent.click(await screen.findByRole("button", { name: "Suspend account" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("signed out everywhere");
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Suspend account" }));

    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/deactivate"))).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("reinstates a suspended account straight away", async () => {
    const api = stubApi({
      "GET /api/v1/admin/customers/3": respond(makeAdminCustomerDetail({ is_active: false })),
      "POST /api/v1/admin/customers/3/activate": respond(makeAdminCustomerDetail()),
    });
    renderWithQuery(<CustomerView id={3} />);

    await userEvent.click(await screen.findByRole("button", { name: "Reinstate account" }));

    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/activate"))).toBe(true));
  });

  it("keeps the dialog open when suspending fails", async () => {
    stubApi({
      "GET /api/v1/admin/customers/3": respond(makeAdminCustomerDetail()),
      "POST /api/v1/admin/customers/3/deactivate": problem(403, "Not allowed", { detail: "Administrator accounts are managed from the command line." }),
    });
    renderWithQuery(<CustomerView id={3} />);

    await userEvent.click(await screen.findByRole("button", { name: "Suspend account" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Suspend account" }));

    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Suspend account" })).toBeEnabled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
