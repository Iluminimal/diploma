import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "@/test/render";
import { AccountMenu } from "./account-menu";
import { useAuth } from "./auth-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/products",
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

beforeEach(() => useAuth.setState({ status: "unknown", accessToken: null, user: null }));

describe("AccountMenu", () => {
  it("shows a placeholder while the session is being restored (no flash of 'sign in')", () => {
    const { container } = renderWithQuery(<AccountMenu />);

    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(container.querySelector("[aria-hidden]")).toBeInTheDocument();
  });

  it("links to sign in and remembers where the visitor was", () => {
    useAuth.setState({ status: "signedOut" });
    renderWithQuery(<AccountMenu />);

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Fproducts");
  });

  it("offers the account pages and sign out to a signed-in shopper", async () => {
    useAuth.setState({
      status: "signedIn",
      accessToken: "t",
      user: { id: 1, email: "ada@example.com", full_name: "Ada Lovelace" },
    });
    renderWithQuery(<AccountMenu />);

    await userEvent.click(screen.getByRole("button", { name: "Account: Ada Lovelace" }));

    expect(await screen.findByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Orders/ })).toHaveAttribute("href", "/account/orders");
    expect(screen.getByRole("menuitem", { name: /Wishlist/ })).toHaveAttribute("href", "/account/wishlist");
    expect(screen.getByRole("menuitem", { name: /Addresses/ })).toHaveAttribute("href", "/account/addresses");
    expect(screen.getByRole("menuitem", { name: /Sign out/ })).toBeInTheDocument();
  });
});
