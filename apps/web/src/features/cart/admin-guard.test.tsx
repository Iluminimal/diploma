import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth, type SessionUser } from "@/features/auth/auth-store";
import { sizesFor } from "@/features/catalog/sizes";
import { makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { AdminShopGuard } from "./admin-shop-guard";
import { CartButton } from "./cart-button";
import { PurchasePanel } from "./purchase-panel";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/products/1",
}));

const signIn = (role: "admin" | "warehouse" | "customer") =>
  useAuth.setState({
    status: "signedIn",
    accessToken: "token",
    user: { id: 1, email: "a@example.com", full_name: "Ada", role } as SessionUser,
  });

beforeEach(() => {
  replace.mockReset();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});

describe("administrators on the storefront", () => {
  it("get a notice and an admin link instead of Add to Bag", () => {
    signIn("admin");
    const product = makeProduct();
    renderWithQuery(<PurchasePanel product={product} sizes={sizesFor(product)} />);

    expect(screen.queryByRole("button", { name: /add to bag/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin panel/i })).toHaveAttribute("href", "/admin");
  });

  it("customers still see Add to Bag", () => {
    signIn("customer");
    const product = makeProduct();
    renderWithQuery(<PurchasePanel product={product} sizes={sizesFor(product)} />);

    expect(screen.getAllByRole("button", { name: /add to bag/i }).length).toBeGreaterThan(0);
  });

  it("have no bag button in the header", () => {
    signIn("admin");
    renderWithQuery(<CartButton />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("are sent back to /admin from the cart and checkout pages", () => {
    signIn("admin");
    render(
      <AdminShopGuard>
        <p>Your bag</p>
      </AdminShopGuard>,
    );

    expect(screen.queryByText("Your bag")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/admin");
  });

  it("warehouse workers are sent to their own workspace from those pages, and have no Add to Bag", () => {
    signIn("warehouse");
    const product = makeProduct();
    renderWithQuery(<PurchasePanel product={product} sizes={sizesFor(product)} />);
    expect(screen.queryByRole("button", { name: /add to bag/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /admin panel/i })).toHaveAttribute("href", "/admin");

    render(
      <AdminShopGuard>
        <p>Your bag</p>
      </AdminShopGuard>,
    );
    expect(screen.queryByText("Your bag")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/admin");
  });

  it("do not affect customers or guests on those pages", () => {
    signIn("customer");
    render(
      <AdminShopGuard>
        <p>Your bag</p>
      </AdminShopGuard>,
    );

    expect(screen.getByText("Your bag")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
