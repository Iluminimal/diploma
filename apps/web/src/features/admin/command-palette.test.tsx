import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useCallback, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "@/test/auth";
import { renderWithQuery } from "@/test/render";
import { fetchAdminCustomers, fetchAdminOrders, fetchAdminProducts } from "./admin-api";
import { CommandPalette, useCommandPaletteHotkeys } from "./command-palette";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/admin" }));
vi.mock("./admin-api", () => ({
  fetchAdminOrders: vi.fn(),
  fetchAdminProducts: vi.fn(),
  fetchAdminCustomers: vi.fn(),
}));

const orders = vi.mocked(fetchAdminOrders);
const products = vi.mocked(fetchAdminProducts);
const customers = vi.mocked(fetchAdminCustomers);

const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pages: 1 }) as never;

function Harness() {
  const [open, setOpen] = useState(false);
  useCommandPaletteHotkeys(
    useCallback(() => setOpen((value) => !value), []),
    useCallback(() => setOpen(true), []),
  );
  return (
    <>
      <input aria-label="Some field" />
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}

beforeEach(() => {
  signInAs("admin");
  push.mockClear();
  orders.mockReset().mockResolvedValue(page([]));
  products.mockReset().mockResolvedValue(page([]));
  customers.mockReset().mockResolvedValue(page([]));
});

describe("CommandPalette", () => {
  it("is closed until ⌘K or Ctrl+K, and the shortcut also closes it", async () => {
    renderWithQuery(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(await screen.findByRole("dialog", { name: "Search the admin" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens with / unless the person is typing in a field", async () => {
    renderWithQuery(<Harness />);

    await userEvent.type(screen.getByRole("textbox", { name: "Some field" }), "/");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: "/" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("lists the sections and narrows them as you type", async () => {
    renderWithQuery(<Harness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(await screen.findByRole("option", { name: "Products" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("combobox"), "prod");

    expect(screen.getByRole("option", { name: "Products" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Reviews" })).not.toBeInTheDocument();
  });

  it("goes to a section when it is chosen", async () => {
    renderWithQuery(<Harness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await userEvent.click(await screen.findByRole("option", { name: "Customers" }));

    expect(push).toHaveBeenCalledWith("/admin/customers");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("finds orders, products and customers from two characters on and opens the one chosen", async () => {
    orders.mockResolvedValue(page([{ number: "LK-ABC123", customer_name: "Ada Lovelace" }]));
    products.mockResolvedValue(page([{ id: 7, name: "Blue Kurta" }]));
    customers.mockResolvedValue(page([{ id: 3, full_name: "Ada Lovelace", email: "ada@example.com", phone: null }]));
    renderWithQuery(<Harness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await userEvent.type(await screen.findByRole("combobox"), "ada");

    expect(await screen.findByRole("option", { name: /LK-ABC123/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Blue Kurta/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /ada@example.com/ })).toBeInTheDocument();
    expect(orders).toHaveBeenCalledWith({ q: "ada", status: "all", page: 1 });
    expect(screen.queryByText("Nothing found.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: /LK-ABC123/ }));
    expect(push).toHaveBeenCalledWith("/admin/orders/LK-ABC123");
  });

  it("says nothing was found only when no section and no result matches", async () => {
    renderWithQuery(<Harness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await userEvent.type(await screen.findByRole("combobox"), "zzzz");

    expect(await screen.findByText("Nothing found.")).toBeInTheDocument();
  });

  it("does not search for a single character", async () => {
    renderWithQuery(<Harness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await userEvent.type(await screen.findByRole("combobox"), "a");
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(orders).not.toHaveBeenCalled();
  });

  it("keeps a warehouse worker out of customers and the activity log: no such sections and no customer search", async () => {
    signInAs("warehouse");
    orders.mockResolvedValue(page([{ number: "LK-ABC123", customer_name: "Ada Lovelace" }]));
    renderWithQuery(<Harness />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await userEvent.type(await screen.findByRole("combobox"), "ada");

    expect(await screen.findByRole("option", { name: /LK-ABC123/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Customers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Activity log" })).not.toBeInTheDocument();
    expect(customers).not.toHaveBeenCalled();
  });
});
