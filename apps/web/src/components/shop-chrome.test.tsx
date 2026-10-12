import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShopChrome } from "./shop-chrome";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const chrome = (
  <ShopChrome header={<header>shop header</header>} footer={<footer>shop footer</footer>}>
    <p>the page</p>
  </ShopChrome>
);

describe("ShopChrome", () => {
  it.each(["/", "/products", "/account/orders", "/administrator"])("wraps %s in the shop's header and footer", (path) => {
    pathname = path;
    render(chrome);

    expect(screen.getByText("shop header")).toBeInTheDocument();
    expect(screen.getByText("shop footer")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByText("the page"));
  });

  it.each(["/admin", "/admin/orders", "/admin/products/12"])("leaves %s to the admin shell", (path) => {
    pathname = path;
    render(chrome);

    expect(screen.getByText("the page")).toBeInTheDocument();
    expect(screen.queryByText("shop header")).not.toBeInTheDocument();
    expect(screen.queryByText("shop footer")).not.toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
