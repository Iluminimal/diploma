import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { sizesFor } from "@/features/catalog/sizes";
import { makeCart, makeCartLine, makeProduct } from "@/test/fixtures";
import { problem, stubApi } from "@/test/api-mock";
import { renderWithQuery } from "@/test/render";
import { useCartDrawer } from "./cart-ui-store";
import { PurchasePanel } from "./purchase-panel";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: (m: string) => toastError(m) }) }));

const shirt = makeProduct();
const watch = makeProduct({ id: 7, master_category: "Accessories", sub_category: "Watches" });
const withShirt = makeCart([makeCartLine({ quantity: 1 })]);

beforeEach(() => {
  toastError.mockReset();
  useCartDrawer.setState({ open: false });
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

function renderPanel(product = shirt) {
  return renderWithQuery(<PurchasePanel product={product} sizes={sizesFor(product)} />);
}

describe("PurchasePanel", () => {
  it("asks for a size instead of adding without one", async () => {
    const api = stubApi({});
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Please select a size");
    expect(api.calls).toHaveLength(0);
  });

  it("adds the chosen size and opens the cart drawer", async () => {
    const api = stubApi({
      "POST /api/v1/cart/items": { body: withShirt },
      "GET /api/v1/cart": { body: withShirt },
    });
    renderPanel();

    await userEvent.click(screen.getByLabelText("M"));
    await userEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    await waitFor(() => expect(useCartDrawer.getState().open).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
      product_id: shirt.id,
      size: "M",
      quantity: 1,
    });
  });

  it("clears the size warning once a size is picked", async () => {
    stubApi({});
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    await userEvent.click(screen.getByLabelText("L"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adds products without sizes straight away", async () => {
    const api = stubApi({
      "POST /api/v1/cart/items": { body: makeCart([makeCartLine({ size: "" })]) },
      "GET /api/v1/cart": { body: makeCart() },
    });
    renderPanel(watch);

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({ product_id: 7, size: "" });
  });

  it("is disabled for sold-out products", () => {
    renderPanel(makeProduct({ in_stock: false }));

    expect(screen.getByRole("button", { name: /sold out/i })).toBeDisabled();
  });

  it("tells the shopper when there is not enough stock and keeps the drawer closed", async () => {
    stubApi({
      "POST /api/v1/cart/items": problem(409, "Not enough stock", {
        type: "urn:lookalike:problem:insufficient-stock",
        detail: "Only 2 of Alma Women Blue Kurta can be added.",
        available: 2,
      }),
      "GET /api/v1/cart": { body: makeCart() },
    });
    renderPanel();

    await userEvent.click(screen.getByLabelText("M"));
    await userEvent.click(screen.getByRole("button", { name: /add to cart/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Only 2 of Alma Women Blue Kurta can be added."));
    expect(useCartDrawer.getState().open).toBe(false);
  });
});
