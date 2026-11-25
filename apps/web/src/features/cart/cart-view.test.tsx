import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { stubApi } from "@/test/api-mock";
import { makeCart, makeCartLine, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { CartView } from "./cart-view";

beforeEach(() => useAuth.setState({ status: "signedOut", accessToken: null, user: null }));
afterEach(() => vi.unstubAllGlobals());

const kurta = makeProduct({ id: 1, name: "Blue Kurta" });

describe("CartView checkout button", () => {
  it("links to checkout when everything is available", async () => {
    stubApi({ "GET /api/v1/cart": { body: makeCart([makeCartLine({ product: kurta })]) } });
    renderWithQuery(<CartView />);

    expect(await screen.findByRole("link", { name: /^checkout/i })).toHaveAttribute("href", "/checkout");
  });

  it("is a disabled button, not a link that still navigates, while an item has a problem", async () => {
    stubApi({
      "GET /api/v1/cart": { body: makeCart([makeCartLine({ product: kurta, quantity: 3, max_quantity: 1, issue: "low_stock" })]) },
    });
    renderWithQuery(<CartView />);

    expect(await screen.findByRole("button", { name: /^checkout/i })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /^checkout/i })).not.toBeInTheDocument();
  });
});
