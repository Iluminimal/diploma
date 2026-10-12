import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { MobileTabBar, showsTabBar } from "./mobile-tab-bar";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  pathname = "/";
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});

describe("showsTabBar", () => {
  it.each([
    ["/", true],
    ["/products", true],
    ["/c/women/clothing", true],
    ["/cart", true],
    ["/account/orders", true],
    ["/search", true],
    ["/products/41885/alma-women-blue-kurta", false],
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
  it("offers the five places, with sign in for a visitor", () => {
    render(<MobileTabBar />);

    const bar = screen.getByRole("navigation", { name: "Quick navigation" });
    expect(bar).toHaveClass("md:hidden");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: "Saved" })).toHaveAttribute("href", "/account/wishlist");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("button", { name: "Search with a photo" })).toBeInTheDocument();
  });

  it("links a signed-in customer to their account", () => {
    useAuth.setState({
      status: "signedIn",
      accessToken: "t",
      user: { id: 1, email: "a@b.co", phone: null, email_verified: false, phone_verified: false, full_name: "A", role: "customer", avatar_url: null, has_password: true, providers: [] },
    });
    render(<MobileTabBar />);

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account/profile");
  });

  it.each([
    ["/", "Home"],
    ["/products", "Shop"],
    ["/c/men", "Shop"],
    ["/account/wishlist", "Saved"],
    ["/account/orders", "Sign in"],
  ])("marks the section you are in: %s is %s", (path, name) => {
    pathname = path;
    render(<MobileTabBar />);

    expect(screen.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("slides its marker to the current tab", () => {
    pathname = "/account/wishlist";
    const { container } = render(<MobileTabBar />);

    const marker = container.querySelector("nav span[aria-hidden]") as HTMLElement;
    expect(marker.style.transform).toContain("translateX(300%)"); // the fourth of five slots
  });

  it("is absent on a product page, where the add-to-cart bar owns the bottom", () => {
    pathname = "/products/41885/alma-women-blue-kurta";
    render(<MobileTabBar />);

    expect(screen.queryByRole("navigation", { name: "Quick navigation" })).not.toBeInTheDocument();
  });

  it("opens the photo picker from the middle button", async () => {
    render(<MobileTabBar />);

    await userEvent.click(screen.getByRole("button", { name: "Search with a photo" }));

    expect(await screen.findByRole("dialog", { name: "Search by photo" })).toBeInTheDocument();
  });
});
