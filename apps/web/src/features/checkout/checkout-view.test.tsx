import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, problem, stubApi } from "@/test/api-mock";
import { makeAddress, makeCart, makeCartLine, makeOrder, makeProduct } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { methods, ruralMethods } from "./checkout-math.test";
import { CheckoutView } from "./checkout-view";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const kurta = makeProduct({ id: 1, name: "Blue Kurta", price_cents: 5_000_000, currency: "MNT" }); // ₮50,000
const inMnt = (lines: ReturnType<typeof makeCartLine>[]) => ({ ...makeCart(lines), currency: "MNT" });
const cart = inMnt([makeCartLine({ id: 10, product: kurta, quantity: 2 })]); // ₮100,000: үнэгүй хүргэлтээс доош
const bigCart = inMnt([makeCartLine({ id: 10, product: kurta, quantity: 4 })]); // ₮200,000

const OFFLINE_PAYMENT = { provider: "offline", charge: { currency: "MNT", amount_minor: 10_500_000 }, qpay: null };
const QPAY_PAYMENT = {
  provider: "qpay",
  charge: { currency: "MNT", amount_minor: 10_500_000 },
  qpay: {
    qr_image: "iVBORw0KGgo=",
    qr_text: "0002010102",
    short_url: "https://s.qpay.mn/abc",
    banks: [{ name: "Khan bank", description: "Хаан банк", logo: "", link: "khanbank://q" }],
  },
};

const routes = (overrides: Record<string, unknown> = {}) => ({
  "GET /api/v1/cart": { body: cart },
  "GET /api/v1/addresses": { body: { items: [makeAddress()] } },
  "GET /api/v1/checkout/shipping-methods": ({ search }: { search: string }) =>
    json(search.includes("zone=rural") ? ruralMethods : methods),
  "GET /api/v1/checkout/payment-method": { body: { provider: "offline", charge_currency: "MNT" } },
  // QPay-ийн QR самбар захиалгын төлвийг манай API-аас үе үе уншина.
  "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder({ status: "pending" }) },
  ...overrides,
});

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

const payButton = () => screen.findByRole("button", { name: /pay now/i });
const placed = () => ({
  "POST /api/v1/checkout": { body: { order: makeOrder({ status: "pending" }), payment: OFFLINE_PAYMENT } },
  "POST /api/v1/checkout/orders/LK-ABCD2345/simulate-payment": { body: makeOrder() },
});

describe("CheckoutView", () => {
  it("shows the address, the Ulaanbaatar shipping options, the test-payment notice and a total with shipping", async () => {
    stubApi(routes() as never);
    renderWithQuery(<CheckoutView />);

    expect(await screen.findByLabelText(/Болд Батбаяр/)).toBeChecked(); // үндсэн хаяг урьдчилан сонгогдсон
    expect(screen.getByRole("radio", { name: /Standard delivery/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Express delivery/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Store pickup/ })).toBeInTheDocument();
    expect(screen.getByText("Test payment")).toBeInTheDocument();
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("Blue Kurta")).toBeInTheDocument();
    expect(within(summary).getByText("₮5,000")).toBeInTheDocument();
    expect(await payButton()).toHaveTextContent("₮105,000"); // 100,000 + 5,000
    expect(await payButton()).toBeEnabled();
  });

  it("updates the total when express is chosen, and pickup is free", async () => {
    stubApi(routes() as never);
    renderWithQuery(<CheckoutView />);

    await userEvent.click(await screen.findByRole("radio", { name: /Express delivery/ }));
    expect(await payButton()).toHaveTextContent("₮112,000"); // 100,000 + 12,000

    await userEvent.click(screen.getByRole("radio", { name: /Store pickup/ }));
    expect(await payButton()).toHaveTextContent("₮100,000");
  });

  it("shows free standard delivery for a big order", async () => {
    stubApi(routes({ "GET /api/v1/cart": { body: bigCart } }) as never);
    renderWithQuery(<CheckoutView />);

    const summary = await screen.findByRole("complementary", { name: "Order summary" });
    expect(within(summary).getAllByText("Free").length).toBeGreaterThan(0);
    expect(within(summary).getByRole("button", { name: /pay now/i })).toHaveTextContent("₮200,000");
  });

  it("offers only rural options, at the rural price, for an address outside Ulaanbaatar", async () => {
    const api = stubApi(
      routes({
        "GET /api/v1/addresses": {
          body: { items: [makeAddress({ id: 2, region: "Дархан-Уул", city: "Дархан", khoroo: "5-р баг" })] },
        },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);

    expect(await screen.findByRole("radio", { name: /Standard delivery/ })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /Express delivery/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Store pickup/ })).toBeInTheDocument();
    expect(await payButton()).toHaveTextContent("₮110,000"); // 100,000 + 10,000
    expect(api.calls.some((c) => c.search.includes("zone=rural"))).toBe(true);
  });

  it("falls back to standard when the chosen express is not offered at the newly picked address", async () => {
    stubApi(
      routes({
        "GET /api/v1/addresses": {
          body: {
            items: [
              makeAddress({ id: 1 }),
              makeAddress({ id: 2, is_default: false, full_name: "Дорж Бат", region: "Орхон", city: "Баян-Өндөр" }),
            ],
          },
        },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await screen.findByRole("radio", { name: /Express delivery/ }));
    expect(await payButton()).toHaveTextContent("₮112,000");

    await userEvent.click(screen.getByLabelText(/Дорж Бат/));

    await waitFor(async () => expect(await payButton()).toHaveTextContent("₮110,000"));
    expect(screen.getByRole("radio", { name: /Standard delivery/ })).toBeChecked();
  });

  it("places the order, takes the test payment and goes to the confirmation page", async () => {
    const api = stubApi(routes(placed()) as never);
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/confirmation/LK-ABCD2345"));
    const checkout = api.calls.find((c) => c.path === "/api/v1/checkout")!;
    expect(checkout.body).toEqual({ address_id: 1, shipping_method: "standard" });
    expect(checkout.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("asks a customer who signed up with a phone for an email, and sends it with the order", async () => {
    useAuth.setState({
      user: { ...useAuth.getState().user!, email: null, phone: "+97699112233", phone_verified: true },
    });
    const api = stubApi(routes(placed()) as never);
    renderWithQuery(<CheckoutView />);

    await userEvent.click(await payButton());
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);

    await userEvent.type(screen.getByLabelText("Email for order updates"), " ada@example.com ");
    await userEvent.click(await payButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/confirmation/LK-ABCD2345"));
    const checkout = api.calls.find((c) => c.path === "/api/v1/checkout")!;
    expect(checkout.body).toEqual({ address_id: 1, shipping_method: "standard", contact_email: "ada@example.com" });
  });

  it("shows the first two steps as done, with a one-line summary, once an address is chosen", async () => {
    stubApi(routes() as never);
    renderWithQuery(<CheckoutView />);

    const address = await screen.findByRole("region", { name: "Delivery address" });
    expect(address).toHaveTextContent("Улаанбаатар, Баянгол, 3-р хороо"); // гарчгийн хажуух хураангуй
    const shipping = screen.getByRole("region", { name: "Shipping method" });
    expect(shipping).toHaveTextContent("Standard delivery, 1-2 business days");
  });

  it("explains stock problems, links to the cart and uses a fresh key for the next attempt", async () => {
    const api = stubApi(
      routes({
        "POST /api/v1/checkout": problem(409, "Some items are no longer available", {
          type: "urn:angel:problem:insufficient-stock",
          detail: "Update your cart and try again.",
        }),
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    const alert = await screen.findByText("Not enough stock for that quantity. Update your Bag and try again.");
    expect(within(alert.closest("p")!).getByRole("link", { name: "Review your Bag" })).toHaveAttribute("href", "/cart");
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
          return json({ order: makeOrder({ status: "paid" }), payment: OFFLINE_PAYMENT });
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

  it("with QPay, shows the QPay method and the order total in tugrik, with no card form", async () => {
    stubApi(routes({ "GET /api/v1/checkout/payment-method": { body: { provider: "qpay", charge_currency: "MNT" } } }) as never);
    renderWithQuery(<CheckoutView />);

    expect(await payButton()).toHaveTextContent("₮105,000"); // харуулсан дүн яг нэхэмжлэгдэх дүн
    expect(screen.queryByLabelText("Card number")).not.toBeInTheDocument();
    expect(screen.getByText("Pay with QPay")).toBeInTheDocument();
  });

  it("with QPay, shows the QR after placing the order and confirms the payment when asked", async () => {
    let paid = false;
    const api = stubApi(
      routes({
        "GET /api/v1/checkout/payment-method": { body: { provider: "qpay", charge_currency: "MNT" } },
        "POST /api/v1/checkout": { body: { order: makeOrder({ status: "pending" }), payment: QPAY_PAYMENT } },
        "POST /api/v1/checkout/orders/LK-ABCD2345/check-payment": () =>
          json(makeOrder({ status: paid ? "paid" : "pending" })),
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    expect(await screen.findByRole("img", { name: /QPay QR code for order LK-ABCD2345/ })).toBeInTheDocument();
    expect(screen.getByText("₮105,000")).toBeInTheDocument();
    expect(api.calls.some((c) => c.path.includes("simulate-payment"))).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: /check payment/i }));
    expect(await screen.findByText(/haven't received the payment yet/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    paid = true;
    await userEvent.click(screen.getByRole("button", { name: /check payment/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/confirmation/LK-ABCD2345"));
  });

  it("explains when payments are not set up on the server", async () => {
    stubApi(routes({ "GET /api/v1/checkout/payment-method": { body: { provider: null, charge_currency: "MNT" } } }) as never);
    renderWithQuery(<CheckoutView />);

    expect(await screen.findByText(/Payments aren't available right now/)).toBeInTheDocument();
    expect(await payButton()).toBeDisabled();
  });

  it("asks for a Mongolian address first when none is saved, and uses the one just added", async () => {
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

    await userEvent.type(await screen.findByLabelText("Full name"), "Болд Батбаяр");
    await userEvent.type(screen.getByLabelText("Phone number"), "9911 2233");
    await userEvent.selectOptions(screen.getByLabelText("District"), "Баянгол");
    await userEvent.type(screen.getByLabelText("Street, building, apartment"), "Энхтайваны өргөн чөлөө 12");
    await userEvent.click(screen.getByRole("button", { name: "Use this address" }));

    await waitFor(() => expect(api.count("POST /api/v1/addresses")).toBe(1));
    expect(api.calls.find((c) => c.method === "POST" && c.path === "/api/v1/addresses")?.body).toMatchObject({
      full_name: "Болд Батбаяр",
      phone: "+97699112233",
      region: "Улаанбаатар",
      city: "Баянгол",
      line1: "Энхтайваны өргөн чөлөө 12",
      country: "MN",
    });
    expect(await screen.findByLabelText(/Болд Батбаяр/)).toBeChecked();
    await waitFor(async () => expect(await payButton()).toBeEnabled());
  });

  it("blocks payment while the cart has problems", async () => {
    stubApi(
      routes({
        "GET /api/v1/cart": {
          body: inMnt([makeCartLine({ id: 10, product: kurta, quantity: 3, max_quantity: 1, issue: "low_stock" })]),
        },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);

    expect(await payButton()).toBeDisabled();
    expect(screen.getByRole("link", { name: "Review your Bag" })).toHaveAttribute("href", "/cart");
  });

  it("shows an empty-cart message instead of a form", async () => {
    stubApi(routes({ "GET /api/v1/cart": { body: makeCart() } }) as never);
    renderWithQuery(<CheckoutView />);

    expect(await screen.findByText("Your Bag is empty")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay now/i })).not.toBeInTheDocument();
  });

  it("with QPay, goes to the confirmation page by itself once the server has marked the order paid", async () => {
    const api = stubApi(
      routes({
        "GET /api/v1/checkout/payment-method": { body: { provider: "qpay", charge_currency: "MNT" } },
        "POST /api/v1/checkout": { body: { order: makeOrder({ status: "pending" }), payment: QPAY_PAYMENT } },
        "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder({ status: "paid" }) },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout/confirmation/LK-ABCD2345"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(api.count("POST /api/v1/checkout/orders/LK-ABCD2345/check-payment")).toBe(0);
  });

  it("cancels the open QPay order from the panel and goes back to the cart", async () => {
    const api = stubApi(
      routes({
        "GET /api/v1/checkout/payment-method": { body: { provider: "qpay", charge_currency: "MNT" } },
        "POST /api/v1/checkout": {
          body: {
            order: { ...makeOrder({ status: "pending" }), expires_at: new Date(Date.now() + 20 * 60_000).toISOString() },
            payment: QPAY_PAYMENT,
          },
        },
        "POST /api/v1/orders/LK-ABCD2345/cancel": { body: makeOrder({ status: "cancelled" }) },
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());
    expect(await screen.findByText(/Invoice valid for/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel this order" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel order" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/cart"));
    expect(api.count("POST /api/v1/orders/LK-ABCD2345/cancel")).toBe(1);
  });

  it("says the attempt expired when the server rejects a replayed key for an expired order", async () => {
    stubApi(
      routes({
        "POST /api/v1/checkout": problem(409, "Order expired", { type: "urn:angel:problem:attempt-expired" }),
      }) as never,
    );
    renderWithQuery(<CheckoutView />);
    await userEvent.click(await payButton());

    expect(await screen.findByText("That attempt expired. Please try again.")).toBeInTheDocument();
  });

  it("sends a signed-out visitor to sign in and back to checkout", async () => {
    useAuth.setState({ status: "signedOut", accessToken: null, user: null });
    stubApi(routes() as never);
    renderWithQuery(<CheckoutView />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fcheckout"));
  });
});
