import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { stubApi } from "@/test/api-mock";
import { makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { WishlistView } from "./wishlist-view";

beforeEach(() =>
  useAuth.setState({ status: "signedIn", accessToken: "t", user: { id: 1, email: "a@b.co", full_name: "Ada", role: "customer" as const } }),
);
afterEach(() => vi.unstubAllGlobals());

describe("WishlistView", () => {
  it("shows saved products as cards", async () => {
    stubApi({
      "GET /api/v1/wishlist": {
        body: { items: [makeProduct({ id: 1, name: "Blue Kurta" }), makeProduct({ id: 2, name: "Red Dress", slug: "red" })] },
      },
    });
    renderWithQuery(<WishlistView />);

    expect(await screen.findByRole("heading", { name: "Blue Kurta" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Red Dress" })).toBeInTheDocument();
  });

  it("explains how to save something when the list is empty", async () => {
    stubApi({ "GET /api/v1/wishlist": { body: { items: [] } } });
    renderWithQuery(<WishlistView />);

    expect(await screen.findByText("Nothing saved yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse products" })).toHaveAttribute("href", "/products");
  });
});
