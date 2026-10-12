import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, problem, stubApi } from "@/test/api-mock";
import { makeCart, makeCartLine, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { MiniCart } from "./mini-cart";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: (m: string) => toastError(m) }) }));

const kurta = makeProduct({ id: 1, name: "Blue Kurta", price_cents: 3000 });
const shoe = makeProduct({ id: 2, name: "White Sneaker", price_cents: 5000 });

beforeEach(() => {
  toastError.mockReset();
  useAuth.setState({ status: "signedOut", accessToken: null, user: null });
});
afterEach(() => vi.unstubAllGlobals());

const twoLines = () =>
  makeCart([
    makeCartLine({ id: 10, product: kurta, quantity: 2, max_quantity: 5 }),
    makeCartLine({ id: 11, product: shoe, quantity: 1, size: "9" }),
  ]);

describe("MiniCart", () => {
  it("lists the lines with size, quantity, subtotal and checkout links", async () => {
    stubApi({ "GET /api/v1/cart": { body: twoLines() } });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);

    expect(await screen.findByText("Blue Kurta")).toBeInTheDocument();
    expect(screen.getByText(/Size 9/)).toBeInTheDocument();
    expect(screen.getByText("$110")).toBeInTheDocument(); // 2 x 30 + 50
    expect(screen.getByRole("link", { name: "Checkout" })).toHaveAttribute("href", "/checkout");
    expect(screen.getByRole("link", { name: "View cart" })).toHaveAttribute("href", "/cart");
  });

  it("shows a friendly empty state", async () => {
    stubApi({ "GET /api/v1/cart": { body: makeCart() } });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);

    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue shopping" })).toHaveAttribute("href", "/products");
  });

  it("updates the quantity at once and keeps the server's answer", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const after = makeCart([
      makeCartLine({ id: 10, product: kurta, quantity: 3, max_quantity: 5 }),
      makeCartLine({ id: 11, product: shoe, quantity: 1, size: "9" }),
    ]);
    const api = stubApi({
      "GET /api/v1/cart": { body: twoLines() },
      "PATCH /api/v1/cart/items/10": async () => {
        await gate;
        return json(after);
      },
    });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);
    await screen.findByText("Blue Kurta");

    await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Blue Kurta" }));

    // The request is still pending, yet the cart already shows the new quantity and total.
    expect(within(screen.getAllByRole("listitem")[0]!).getByText("3")).toBeInTheDocument();
    // (totals count up to the new figure, so give the count a moment)
    expect(await screen.findByText("$140")).toBeInTheDocument();
    release();
    await waitFor(() => expect(api.count("PATCH /api/v1/cart/items/10")).toBe(1));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ quantity: 3 });
  });

  it("rolls back and explains when the server refuses the change", async () => {
    stubApi({
      "GET /api/v1/cart": { body: twoLines() },
      "PATCH /api/v1/cart/items/10": problem(409, "Not enough stock", {
        type: "urn:angel:problem:insufficient-stock",
        detail: "Only 2 of Blue Kurta can be added.",
      }),
    });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);
    await screen.findByText("Blue Kurta");

    await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Blue Kurta" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Only 2 of Blue Kurta can be added."));
    expect(within(screen.getAllByRole("listitem")[0]!).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("$110")).toBeInTheDocument();
  });

  it("cannot go above the stock limit or below one", async () => {
    stubApi({
      "GET /api/v1/cart": {
        body: makeCart([makeCartLine({ id: 10, product: kurta, quantity: 5, max_quantity: 5 })]),
      },
    });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);
    await screen.findByText("Blue Kurta");

    expect(screen.getByRole("button", { name: "Increase quantity of Blue Kurta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease quantity of Blue Kurta" })).toBeEnabled();
  });

  it("removes a line", async () => {
    let server = twoLines();
    const api = stubApi({
      "GET /api/v1/cart": () => json(server),
      "DELETE /api/v1/cart/items/11": () => {
        server = makeCart([makeCartLine({ id: 10, product: kurta, quantity: 2 })]);
        return json(server);
      },
    });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);
    await screen.findByText("White Sneaker");

    await userEvent.click(screen.getByRole("button", { name: "Remove White Sneaker from your cart" }));

    await waitFor(() => expect(screen.queryByText("White Sneaker")).not.toBeInTheDocument());
    expect(api.count("DELETE /api/v1/cart/items/11")).toBe(1);
    expect(screen.getByText("Blue Kurta")).toBeInTheDocument();
  });

  it("flags lines that ran out of stock or are over the limit, and offers the fix", async () => {
    const api = stubApi({
      "GET /api/v1/cart": {
        body: makeCart([
          makeCartLine({ id: 10, product: kurta, quantity: 4, max_quantity: 2, issue: "low_stock" }),
          makeCartLine({ id: 11, product: shoe, quantity: 1, max_quantity: 0, issue: "out_of_stock" }),
        ]),
      },
      "PATCH /api/v1/cart/items/10": { body: makeCart() },
    });
    renderWithQuery(<MiniCart onNavigate={vi.fn()} />);

    expect(await screen.findByText(/Only 2 left/)).toBeInTheDocument();
    expect(screen.getByText(/Sold out. Remove it to check out/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Update to 2" }));
    await waitFor(() => expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ quantity: 2 }));
  });

  it("calls onNavigate so the drawer can close when a link is followed", async () => {
    const onNavigate = vi.fn();
    stubApi({ "GET /api/v1/cart": { body: twoLines() } });
    renderWithQuery(<MiniCart onNavigate={onNavigate} />);

    await userEvent.click(await screen.findByRole("link", { name: "Checkout" }));

    expect(onNavigate).toHaveBeenCalled();
  });
});
