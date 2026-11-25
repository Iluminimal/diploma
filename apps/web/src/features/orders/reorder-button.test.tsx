import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBagPanel } from "@/features/cart/cart-ui-store";
import { json, problem, stubApi } from "@/test/api-mock";
import { signInAs } from "@/test/auth";
import { makeCart, makeCartLine } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { ReorderButton } from "./reorder-button";

const notice = vi.fn();
const noticeError = vi.fn();
const noticeSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign((m: string) => notice(m), {
    error: (m: string) => noticeError(m),
    success: (m: string) => noticeSuccess(m),
  }),
}));

const cart = makeCart([makeCartLine({ quantity: 2 })]);

beforeEach(() => {
  notice.mockReset();
  noticeError.mockReset();
  noticeSuccess.mockReset();
  useBagPanel.setState({ open: false });
  signInAs("customer");
});
afterEach(() => vi.unstubAllGlobals());

describe("ReorderButton", () => {
  it("puts the order back in the bag and opens it", async () => {
    stubApi({
      "POST /api/v1/orders/LK-ABCD2345/reorder": () => json({ cart, added: 2, skipped: [] }),
      "GET /api/v1/cart": () => json(cart),
    });
    renderWithQuery(<ReorderButton number="LK-ABCD2345" />);

    await userEvent.click(screen.getByRole("button", { name: "Buy again" }));

    await waitFor(() => expect(useBagPanel.getState().open).toBe(true));
    expect(noticeSuccess).toHaveBeenCalledWith("2 items added to your bag.");
    expect(notice).not.toHaveBeenCalled();
  });

  it("says why a line was left out or reduced", async () => {
    stubApi({
      "POST /api/v1/orders/LK-ABCD2345/reorder": () =>
        json({
          cart,
          added: 1,
          skipped: [
            { name: "Blue Kurta", reason: "out_of_stock" },
            { name: "Red Tee", reason: "reduced" },
          ],
        }),
      "GET /api/v1/cart": () => json(cart),
    });
    renderWithQuery(<ReorderButton number="LK-ABCD2345" />);

    await userEvent.click(screen.getByRole("button", { name: "Buy again" }));

    await waitFor(() => expect(notice).toHaveBeenCalledTimes(2));
    expect(notice).toHaveBeenCalledWith("Blue Kurta is sold out.");
    expect(notice).toHaveBeenCalledWith("Red Tee: only what is in stock was added.");
  });

  it("does not open the bag when nothing could be added", async () => {
    stubApi({
      "POST /api/v1/orders/LK-ABCD2345/reorder": () =>
        json({ cart: makeCart(), added: 0, skipped: [{ name: "Blue Kurta", reason: "unavailable" }] }),
      "GET /api/v1/cart": () => json(makeCart()),
    });
    renderWithQuery(<ReorderButton number="LK-ABCD2345" />);

    await userEvent.click(screen.getByRole("button", { name: "Buy again" }));

    await waitFor(() => expect(noticeError).toHaveBeenCalledWith("Nothing from this order could be added to your bag."));
    expect(useBagPanel.getState().open).toBe(false);
  });

  it("reports a failure", async () => {
    stubApi({ "POST /api/v1/orders/LK-ABCD2345/reorder": () => problem(404, "No such order") });
    renderWithQuery(<ReorderButton number="LK-ABCD2345" />);

    await userEvent.click(screen.getByRole("button", { name: "Buy again" }));

    await waitFor(() => expect(noticeError).toHaveBeenCalled());
  });

  it("is not shown to staff", () => {
    signInAs("admin");
    renderWithQuery(<ReorderButton number="LK-ABCD2345" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
