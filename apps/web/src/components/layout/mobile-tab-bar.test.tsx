import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth, type SessionUser } from "@/features/auth/auth-store";
import { useCartDrawer } from "@/features/cart/cart-ui-store";
import { makeCart, makeCartLine } from "@/test/fixtures";
import { json, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { MobileTabBar } from "./mobile-tab-bar";
import { useSearchPanel } from "./search-ui-store";
import { showsTabBar } from "./tab-bar-rules";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

const user: SessionUser = {
  id: 1,
  email: "ada@example.com",
  phone: null,
  email_verified: false,
  phone_verified: false,
  full_name: "Ada Lovelace",
  role: "customer",
  avatar_url: null,
  has_password: true,
  providers: [],
};

beforeEach(() => {
  pathname = "/";
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
  useCartDrawer.setState({ open: false });
  useSearchPanel.setState({ requests: 0 });
  stubApi({ "GET /api/v1/cart": () => json(makeCart()) });
});
afterEach(() => vi.unstubAllGlobals());

describe("showsTabBar", () => {
  it.each([
    ["/", true],
    ["/products", true],
    ["/products/41885/alma-women-blue-kurta", true],
    ["/c/women/clothing", true],
    ["/cart", true],
    ["/account/orders", true],
    ["/search", true],
    ["/checkout", false],
    ["/checkout/confirmation/LK-ABCD2345", false],
    ["/login", false],
    ["/register", false],
    ["/forgot-password", false],
  ])("%s -> %s", (path, shown) => {
    expect(showsTabBar(path)).toBe(shown);
  });
});

describe("MobileTabBar", () => {
  it("is five icons with names and no visible words", () => {
    renderWithQuery(<MobileTabBar />);

    const bar = screen.getByRole("navigation", { name: "Quick navigation" });
    expect(bar).toHaveClass("md:hidden");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search with a photo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cart" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(bar.textContent).toBe("");
  });

  it("shows the customer's own photo or initials as the last tab, linking to the profile", () => {
    useAuth.setState({ status: "signedIn", accessToken: "t", user });
    renderWithQuery(<MobileTabBar />);

    const you = screen.getByRole("link", { name: "Account: Ada Lovelace" });
    expect(you).toHaveAttribute("href", "/account/profile");
    expect(you).toHaveTextContent("AL");
  });

  it.each([
    ["/", "Home"],
    ["/account/orders", "Sign in"],
  ])("marks the tab you are on: %s is %s", (path, name) => {
    pathname = path;
    renderWithQuery(<MobileTabBar />);

    expect(screen.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("marks neither link on a page that is none of them", () => {
    pathname = "/products";
    renderWithQuery(<MobileTabBar />);

    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(0);
  });

  it("counts what is in the cart on the cart tab and opens the drawer from it", async () => {
    stubApi({ "GET /api/v1/cart": () => json(makeCart([makeCartLine({ quantity: 3 })])) });
    renderWithQuery(<MobileTabBar />);

    const cart = await screen.findByRole("button", { name: "Cart, 3 items" });
    expect(cart).toHaveTextContent("3");
    await userEvent.click(cart);

    expect(useCartDrawer.getState().open).toBe(true);
  });

  it("asks the search panel to open from the Search tab", async () => {
    renderWithQuery(<MobileTabBar />);

    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(useSearchPanel.getState().requests).toBe(1);
  });

  it("opens the photo picker from the camera tab", async () => {
    renderWithQuery(<MobileTabBar />);

    await userEvent.click(screen.getByRole("button", { name: "Search with a photo" }));

    expect(await screen.findByRole("dialog", { name: "Search by photo" })).toBeInTheDocument();
  });

  it("is shown on a product page, where it is the only way to search or reach the cart", () => {
    pathname = "/products/41885/alma-women-blue-kurta";
    renderWithQuery(<MobileTabBar />);

    expect(screen.getByRole("navigation", { name: "Quick navigation" })).toBeInTheDocument();
  });

  it("is absent at checkout and on the sign-in pages", () => {
    for (const path of ["/checkout", "/login", "/register"]) {
      pathname = path;
      const { unmount } = renderWithQuery(<MobileTabBar />);
      expect(screen.queryByRole("navigation", { name: "Quick navigation" })).not.toBeInTheDocument();
      act(() => unmount());
    }
  });
});
