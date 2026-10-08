import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountNav } from "./account-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/account/orders/LK-ABCD2345" }));

describe("AccountNav", () => {
  it("marks the section being viewed, including its sub-pages", () => {
    render(<AccountNav />);

    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Wishlist" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Addresses" })).toHaveAttribute("href", "/account/addresses");
  });
});
