import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "@/test/auth";
import { testIntl } from "@/test/intl";
import { AdminNav } from "./admin-nav";

let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("AdminNav", () => {
  beforeEach(() => signInAs("admin"));

  it("links every section of the back office", () => {
    pathname = "/admin";
    render(<AdminNav />);

    const links = screen.getAllByRole("link").map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
    expect(links).toEqual([
      ["Dashboard", "/admin"],
      ["Orders", "/admin/orders"],
      ["Products", "/admin/products"],
      ["Customers", "/admin/customers"],
      ["Reviews", "/admin/reviews"],
      ["Activity log", "/admin/activity"],
    ]);
  });

  it("is in Mongolian when the site is", () => {
    testIntl.locale = "mn";
    pathname = "/admin";
    render(<AdminNav />);

    expect(screen.getAllByRole("link").map((link) => link.textContent?.trim())).toEqual([
      "Хяналтын самбар",
      "Захиалга",
      "Бараа",
      "Хэрэглэгчид",
      "Сэтгэгдэл",
      "Үйлдлийн журнал",
    ]);
    expect(screen.getByRole("navigation", { name: "Админ" })).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "Customers" })).not.toHaveAttribute("aria-current");
  });

  it("shows a warehouse worker the board, orders and products only", () => {
    signInAs("warehouse");
    pathname = "/admin/products";
    render(<AdminNav />);

    const links = screen.getAllByRole("link").map((link) => [link.textContent?.trim(), link.getAttribute("href")]);
    expect(links).toEqual([
      ["Dashboard", "/admin"],
      ["Orders", "/admin/orders"],
      ["Products", "/admin/products"],
    ]);
    expect(screen.queryByText("People")).not.toBeInTheDocument();
    expect(screen.queryByText("Oversight")).not.toBeInTheDocument();
  });

  it("shows a customer nothing", () => {
    signInAs("customer");
    render(<AdminNav />);

    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
