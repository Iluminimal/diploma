import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, problem, stubApi } from "@/test/api-mock";
import { makeAddress, makeCart, makeCartLine, makeOrder, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { methods } from "./checkout-math.test";
import { CheckoutView } from "./checkout-view";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const kurta = makeProduct({ id: 1, name: "Blue Kurta", price_cents: 3000 });
const cart = makeCart([makeCartLine({ id: 10, product: kurta, quantity: 2 })]); // $60: below free shipping
const bigCart = makeCart([makeCartLine({ id: 10, product: kurta, quantity: 4 })]); // $120

const routes = (overrides: Record<string, unknown> = {}) => ({
  "GET /api/v1/cart": { body: cart },
  "GET /api/v1/addresses": { body: { items: [makeAddress()] } },
  "GET /api/v1/checkout/shipping-methods": { body: methods },
  ...overrides,
});

beforeEach(() => {
  push.mockReset();
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const },
  });
});
afterEach(() => vi.unstubAllGlobals());

const payButton = () => screen.findByRole("button", { name: /pay now/i });

describe("CheckoutView", () => {
  it("shows the address, shipping options, demo payment notice and a total with shipping", async () => {
    stubApi(routes() as never);
    renderWithQuery(<CheckoutView />);

    expect(await screen.findByLabelText(/Ada Lovelace/)).toBeChecked(); // the default address is preselected
    expect(screen.getByRole("radio", { name: /Standard shipping/ })).toBeChecked();
    expect(screen.getByText(/Demo payment, no real charge\./, { selector: "strong" })).toBeInTheDocument();
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("Blue Kurta")).toBeInTheDocument();
    expect(within(summary).getByText("$4.99")).toBeInTheDocument();
    expect(await payButton()).toHaveTextContent("$64.99"); // 60 + 4.99
    expect(await payButton()).toBeEnabled();
  });

  it("updates the total when express shipping is chosen and makes standard free over the threshold", async () => {
    stubApi(routes() as never);
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await screen.findByRole("radio", { name: /Express shipping/ }));
    expect(await payButton()).toHaveTextContent("$72.99"); // 60 + 12.99
  });

  it("shows free standard shipping for a big order", async () => {
    stubApi(routes({ "GET /api/v1/cart": { body: bigCart } }) as never);
    renderWithQuery(<CheckoutView />);

    const summary = await screen.findByRole("complementary", { name: "Order summary" });
    expect(within(summary).getAllByText("Free").length).toBeGreaterThan(0);
    expect(within(summary).getByRole("button", { name: /pay now/i })).toHaveTextContent("$120");
  });

  it("checks the card form before doing anything", async () => {
    const api = stubApi(routes() as never);
    renderWithQuery(<CheckoutView />);
    const card = await screen.findByLabelText("Card number");
    await userEvent.clear(card);
    await userEvent.type(card, "1234");

    await userEvent.click(await payButton());

    expect(await screen.findByText(/13 to 19 digits/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("places the order, takes the demo payment and goes to the confirmation page", async () => {
    const api = stubApi(
      routes({
        "POST /api/v1/checkout": {
          body: {
            order: makeOrder({ status: "pending" }),
            payment: { provider: "offline", client_secret: "pi_x_secret" },
          },
        },
        "POST /api/v1/checkout/orders/LK-ABCD2345/simulate-payment": { body: makeOrder() },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/confirmation/LK-ABCD2345"));
    const checkout = api.calls.find((c) => c.path === "/api/v1/checkout")!;
    expect(checkout.body).toEqual({ address_id: 1, shipping_method: "standard" });
    expect(checkout.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    // Card details never leave the page.
    expect(JSON.stringify(api.calls.map((c) => c.body))).not.toContain("4242");
  });

  it("explains stock problems, links to the cart and uses a fresh key for the next attempt", async () => {
    const api = stubApi(
      routes({
        "POST /api/v1/checkout": problem(409, "Some items are no longer available", {
          type: "urn:lookalike:problem:insufficient-stock",
          detail: "Update your cart and try again.",
        }),
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    const alert = await screen.findByText("Update your cart and try again.");
    expect(within(alert.closest("p")!).getByRole("link", { name: "Review your cart" })).toHaveAttribute("href", "/cart");
    await userEvent.click(await payButton());
    await waitFor(() => expect(api.count("POST /api/v1/checkout")).toBe(2));
    const keys = api.calls.filter((c) => c.path === "/api/v1/checkout").map((c) => c.headers.get("Idempotency-Key"));
    expect(keys[0]).not.toBe(keys[1]);
    expect(push).not.toHaveBeenCalled();
  });

  it("repeats the same key after a dropped connection so no second order can be created", async () => {
    let attempt = 0;
    const api = stubApi(
      routes({
        "POST /api/v1/checkout": () => {
          attempt += 1;
          if (attempt === 1) throw new TypeError("network down");
          return json({ order: makeOrder({ status: "paid" }), payment: { provider: "offline", client_secret: null } });
        },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());
    expect(await screen.findByText(/can't reach the server/i)).toBeInTheDocument();

    await userEvent.click(await payButton());

    await waitFor(() => expect(push).toHaveBeenCalled());
    const keys = api.calls.filter((c) => c.path === "/api/v1/checkout").map((c) => c.headers.get("Idempotency-Key"));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("refuses to pretend when the server is set up for live payments", async () => {
    const api = stubApi(
      routes({
        "POST /api/v1/checkout": {
          body: { order: makeOrder({ status: "pending" }), payment: { provider: "stripe", client_secret: "x" } },
        },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    expect(await screen.findByText(/only takes demo payments/i)).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.includes("simulate-payment"))).toBe(false);
  });

  it("asks for an address first when none is saved, and uses the one just added", async () => {
    let saved = false;
    const api = stubApi(
      routes({
        "GET /api/v1/addresses": () => json({ items: saved ? [makeAddress({ id: 5 })] : [] }),
        "POST /api/v1/addresses": () => {
          saved = true;
          return json(makeAddress({ id: 5 }), 201);
        },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    expect(await payButton()).toBeDisabled();

    await userEvent.type(await screen.findByLabelText("Full name"), "Ada Lovelace");
    await userEvent.type(screen.getByLabelText("Address", { selector: "input" }), "12 Analytical Way");
    await userEvent.type(screen.getByLabelText("City"), "London");
    await userEvent.type(screen.getByLabelText("Postal code"), "N1 9GU");
    await userEvent.click(screen.getByRole("button", { name: "Use this address" }));

    await waitFor(() => expect(api.count("POST /api/v1/addresses")).toBe(1));
    expect(await screen.findByLabelText(/Ada Lovelace/)).toBeChecked();
    await waitFor(async () => expect(await payButton()).toBeEnabled());
  });

  it("blocks payment while the cart has problems", async () => {
    stubApi(
      routes({
        "GET /api/v1/cart": {
          body: makeCart([makeCartLine({ id: 10, product: kurta, quantity: 3, max_quantity: 1, issue: "low_stock" })]),
        },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);

    expect(await payButton()).toBeDisabled();
    expect(screen.getByRole("link", { name: "Review your cart" })).toHaveAttribute("href", "/cart");
  });

  it("shows an empty-cart message instead of a form", async () => {
    stubApi(routes({ "GET /api/v1/cart": { body: makeCart() } }) as never);
    renderWithQuery(<CheckoutView />);

    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay now/i })).not.toBeInTheDocument();
  });
});
