import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountNav } from "./account-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/account/orders/LK-ABCD2345" }));

describe("AccountNav", () => {
  it("slides one pill behind the current tab", () => {
    const original = Object.getOwnPropertyDescriptors(HTMLElement.prototype);
    Object.defineProperty(HTMLElement.prototype, "offsetLeft", { configurable: true, get: () => 120 });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 96 });
    try {
      const { container } = render(<AccountNav />);

      const pill = container.querySelector("nav > span[aria-hidden]") as HTMLElement;
      expect(pill.style.left).toBe("120px");
      expect(pill.style.width).toBe("96px");
      // The tab itself is transparent over the pill, so only one thing carries the colour.
      expect(screen.getByRole("link", { name: "Orders" })).not.toHaveClass("bg-foreground");
    } finally {
      Object.defineProperty(HTMLElement.prototype, "offsetLeft", original.offsetLeft ?? { value: 0, configurable: true });
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", original.offsetWidth ?? { value: 0, configurable: true });
    }
  });

  it("marks the section being viewed, including its sub-pages", () => {
    render(<AccountNav />);

    expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Wishlist" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Addresses" })).toHaveAttribute("href", "/account/addresses");
  });
});
