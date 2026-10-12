import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminNav } from "./admin-nav";

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AdminNav", () => {
  it("links every section of the back office", () => {
    pathname = "/admin";
    render(<AdminNav />);

    const links = screen.getAllByRole("link").map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
    expect(links).toEqual([
      ["Dashboard", "/admin"],
      ["Orders", "/admin/orders"],
      ["Products", "/admin/products"],
      ["Inventory", "/admin/inventory"],
      ["Customers", "/admin/customers"],
      ["Reviews", "/admin/reviews"],
    ]);
  });

  it("marks only the dashboard as current on the dashboard", () => {
    pathname = "/admin";
    render(<AdminNav />);

    expect(screen.getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps a section current on its sub-pages, and not the dashboard", () => {
    pathname = "/admin/orders/LK-ABCD2345";
    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("does not confuse sections that share a prefix", () => {
    pathname = "/admin/products";
    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inventory" })).not.toHaveAttribute("aria-current");
  });
});
