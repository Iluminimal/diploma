import { act, screen, waitFor } from "@testing-library/react";
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

    await userEvent.click(screen.getByRole("button", { name: /add to bag/i }));

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
    await userEvent.click(screen.getByRole("button", { name: /add to bag/i }));

    await waitFor(() => expect(useCartDrawer.getState().open).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({
      product_id: shirt.id,
      size: "M",
      quantity: 1,
    });
  });

  it("shakes the sizes and puts the cursor in them when none is chosen", async () => {
    stubApi({});
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /add to bag/i }));

    expect(screen.getByRole("group", { name: /size/i }).parentElement).toHaveClass("animate-shake");
    expect(screen.getByRole("group", { name: /size/i })).toHaveAttribute("aria-describedby", "size-error");
    expect(screen.getAllByRole("radio")[0]).toHaveFocus();
  });

  it("confirms with a check mark on the button after adding, then goes back", async () => {
    stubApi({
      "POST /api/v1/cart/items": { body: withShirt },
      "GET /api/v1/cart": { body: withShirt },
    });
    renderPanel();

    await userEvent.click(screen.getByLabelText("M"));
    await userEvent.click(screen.getByRole("button", { name: /add to bag/i }));

    expect(await screen.findByRole("button", { name: "Added" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("was added to your Bag");
    expect(useCartDrawer.getState().added).toEqual({ productId: shirt.id, size: "M" });
    await waitFor(() => expect(screen.getByRole("button", { name: /add to bag/i })).toBeInTheDocument(), { timeout: 3000 });
  });

  it("clears the size warning once a size is picked", async () => {
    stubApi({});
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: /add to bag/i }));

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
    await userEvent.click(screen.getByRole("button", { name: /add to bag/i }));

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
        type: "urn:angel:problem:insufficient-stock",
        detail: "Only 2 of Alma Women Blue Kurta can be added.",
        available: 2,
      }),
      "GET /api/v1/cart": { body: makeCart() },
    });
    renderPanel();

    await userEvent.click(screen.getByLabelText("M"));
    await userEvent.click(screen.getByRole("button", { name: /add to bag/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Only 2 of Alma Women Blue Kurta can be added."));
    expect(useCartDrawer.getState().open).toBe(false);
  });

  describe("sticky bar", () => {
    let report: (isIntersecting: boolean) => void = () => {};

    beforeEach(() => {
      vi.stubGlobal(
        "IntersectionObserver",
        class {
          constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
            report = (isIntersecting) => callback([{ isIntersecting }]);
          }
          observe() {}
          disconnect() {}
        },
      );
    });

    const main = () => screen.getAllByRole("button", { name: /^add to bag$/i });
    const bar = () => screen.queryByRole("button", { name: "Add Alma Women Blue Kurta to Bag" });

    it("keeps Add to Bag in reach once the main button has scrolled away", async () => {
      renderPanel();
      expect(main()).toHaveLength(1);
      expect(bar()).not.toBeInTheDocument();

      act(() => report(false));

      expect(await screen.findByRole("button", { name: "Add Alma Women Blue Kurta to Bag" })).toBeInTheDocument();
      expect(main()).toHaveLength(1);

      act(() => report(true));
      await waitFor(() => expect(bar()).not.toBeInTheDocument());
    });

    it("asks for a size from the bar too", async () => {
      renderPanel();
      act(() => report(false));

      await userEvent.click(await screen.findByRole("button", { name: "Add Alma Women Blue Kurta to Bag" }));

      expect(screen.getByRole("alert")).toHaveTextContent("Please select a size");
    });

    it("has no bar for a sold-out product", () => {
      renderPanel(makeProduct({ in_stock: false }));
      act(() => report(false));

      expect(bar()).not.toBeInTheDocument();
    });
  });
});
