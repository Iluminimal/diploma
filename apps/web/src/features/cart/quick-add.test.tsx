import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { stubApi } from "@/test/api-mock";
import { signInAs } from "@/test/auth";
import { makeCart, makeCartLine, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { useBagPanel } from "./cart-ui-store";
import { QuickAdd } from "./quick-add";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const shirt = makeProduct({ name: "Blue Kurta" });
const watch = makeProduct({ id: 7, name: "Steel Watch", master_category: "Accessories", sub_category: "Watches" });
const cart = makeCart([makeCartLine({ quantity: 1 })]);

beforeEach(() => {
  useBagPanel.setState({ open: false, added: null });
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

describe("QuickAdd", () => {
  it("adds a product that has no sizes with one tap and opens the Bag", async () => {
    const api = stubApi({ "POST /api/v1/cart/items": { body: cart }, "GET /api/v1/cart": { body: cart } });
    renderWithQuery(<QuickAdd product={watch} />);

    await userEvent.click(screen.getByRole("button", { name: "Quick add Steel Watch" }));

    await waitFor(() => expect(useBagPanel.getState().open).toBe(true));
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ product_id: 7, size: "", quantity: 1, });
  });

  it("asks for a size first, and adds the moment one is chosen", async () => {
    const api = stubApi({ "POST /api/v1/cart/items": { body: cart }, "GET /api/v1/cart": { body: cart } });
    renderWithQuery(<QuickAdd product={shirt} />);

    await userEvent.click(screen.getByRole("button", { name: "Quick add Blue Kurta" }));
    expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(0);
    const sizes = within(await screen.findByRole("group", { name: /Choose a size for Blue Kurta/ }));
    await userEvent.click(sizes.getByLabelText("L"));

    await waitFor(() => expect(useBagPanel.getState().open).toBe(true));
    expect(api.calls.find((call) => call.method === "POST")?.body).toEqual({ product_id: 41885, size: "L", quantity: 1 });
    expect(useBagPanel.getState().added).toEqual({ productId: 41885, size: "L" });
  });

  it("is not offered for a sold-out product", () => {
    renderWithQuery(<QuickAdd product={makeProduct({ in_stock: false })} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is not offered to staff, who do not shop", () => {
    signInAs("warehouse");
    renderWithQuery(<QuickAdd product={shirt} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
