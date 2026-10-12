import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { catalogNav } from "@/test/fixtures";
import { MobileNavMenu } from "./mobile-nav-menu";

vi.mock("@/features/catalog/use-catalog-nav", () => ({ useCatalogNav: () => ({ data: catalogNav, isPending: false }) }));
vi.mock("@/features/auth/auth-store", () => ({
  useAuth: (select: (state: { status: string }) => unknown) => select({ status: "signedOut" }),
}));

describe("MobileNavMenu", () => {
  it("drills from a department down to an article type and back", async () => {
    render(<MobileNavMenu defaultOpen />);
    expect(screen.getByRole("link", { name: "New" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Men" }));
    expect(screen.getByRole("heading", { name: "Men" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Shop all Men" })).toHaveAttribute("href", "/c/men");

    await userEvent.click(screen.getByRole("button", { name: "Clothing" }));
    await userEvent.click(screen.getByRole("button", { name: "Topwear" }));
    expect(screen.getByRole("link", { name: "T-shirts" })).toHaveAttribute("href", "/c/men/apparel/topwear/tshirts");

    await userEvent.click(screen.getByRole("button", { name: "Back to Clothing" }));
    expect(screen.getByRole("heading", { name: "Clothing" })).toBeInTheDocument();
  });

  it("has only the shop in it: the account lives in the bottom bar, so it is not listed twice", () => {
    render(<MobileNavMenu defaultOpen />);

    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    for (const name of ["Profile", "Orders", "Wishlist", "Addresses"]) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("makes a department without data an ordinary link", () => {
    render(<MobileNavMenu defaultOpen />);

    expect(screen.getByRole("link", { name: "Kids" })).toHaveAttribute("href", "/c/kids");
  });
});
