import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { AccountNav, AccountSignOut } from "./account-nav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/orders/LK-ABCD2345",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

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
      // Tab өөрөө pill дээр тунгалаг тул зөвхөн нэг элемент өнгө авч явна.
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

describe("AccountSignOut", () => {
  const signedIn = {
    status: "signedIn" as const,
    accessToken: "t",
    user: { id: 1, email: "a@b.co", phone: null, email_verified: false, phone_verified: false, full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, providers: [] as string[] },
  };

  it("is a phone-only button that signs the customer out", async () => {
    useAuth.setState(signedIn);
    const api = stubApi({
      "POST /api/v1/auth/logout": { status: 204 },
      "GET /api/v1/cart": { body: { lines: [], item_count: 0, subtotal_cents: 0, currency: "USD", has_issues: false } },
    });
    renderWithQuery(<AccountSignOut />);

    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button).toHaveClass("md:hidden");
    await userEvent.click(button);

    await waitFor(() => expect(useAuth.getState().status).toBe("signedOut"));
    expect(api.count("POST /api/v1/auth/logout")).toBe(1);
  });

  it("is not there for a visitor", () => {
    useAuth.setState({ status: "signedOut", accessToken: null, user: null });
    renderWithQuery(<AccountSignOut />);

    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });
});
