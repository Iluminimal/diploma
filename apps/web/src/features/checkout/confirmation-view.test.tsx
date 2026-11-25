import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { json, problem, stubApi } from "@/test/api-mock";
import { makeOrder } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { ConfirmationView } from "./confirmation-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(() => {
  replace.mockReset();
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "ada@example.com", full_name: "Ada", role: "customer" as const, avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("ConfirmationView", () => {
  it("sends a signed-out visitor to sign in and back, instead of waiting on a skeleton forever", async () => {
    useAuth.setState({ status: "signedOut", accessToken: null, user: null });
    stubApi({});
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fcheckout%2Fconfirmation%2FLK-ABCD2345"));
  });

  it("thanks the shopper and shows what was bought, where it goes and what was charged", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder() } });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    expect(await screen.findByRole("heading", { name: "Thank you for your order" })).toBeInTheDocument();
    expect(screen.getByText("LK-ABCD2345")).toBeInTheDocument();
    expect(screen.getByText("Alma Women Blue Kurta")).toBeInTheDocument();
    expect(screen.getByText(/Энхтайваны өргөн чөлөө 12/)).toBeInTheDocument();
    expect(screen.getByText("$74.97")).toBeInTheDocument(); // 2 x 34.99 + 4.99
    expect(screen.getAllByText(/ada@example.com/).length).toBeGreaterThan(0);
  });

  it("says what happens next once the order is paid, and not before", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder() } });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    const next = await screen.findByRole("region", { name: "What happens next" });
    expect(next).toHaveTextContent("A receipt is on its way to ada@example.com");
    expect(next).toHaveTextContent("tracking number");
  });

  it("keeps checking while the payment is still being confirmed", async () => {
    const api = stubApi({
      "GET /api/v1/orders/LK-ABCD2345": () => json(makeOrder({ status: api.count("GET /api/v1/orders/LK-ABCD2345") > 1 ? "paid" : "pending" })),
    });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    expect(await screen.findByRole("heading", { name: /Confirming your payment/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Thank you for your order" })).toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  it("says so when the order was cancelled", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder({ status: "cancelled", paid_at: null }) } });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    expect(await screen.findByRole("heading", { name: "This order was cancelled" })).toBeInTheDocument();
  });

  it("does not reveal whether someone else's order exists", async () => {
    stubApi({
      "GET /api/v1/orders/LK-OTHER000": problem(404, "Order not found", { type: "urn:angel:problem:order-not-found" }),
    });
    renderWithQuery(<ConfirmationView number="LK-OTHER000" />);

    expect(await screen.findByRole("heading", { name: /couldn't find that order/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Your orders" })).toHaveAttribute("href", "/account/orders");
  });
});

describe("ConfirmationView, a payment that is still open", () => {
  const open = makeOrder({
    status: "pending",
    expires_at: new Date(Date.now() + 25 * 60_000).toISOString(),
    qpay: { qr_image: "iVBORw0KGgo=", qr_text: "0002", short_url: "https://s.qpay.mn/x", banks: [] },
    charge: { currency: "MNT", amount_minor: 10_500_000 },
  });

  it("brings the QR, the deadline and the cancel button back, so a reload never loses the payment", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: open } });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    expect(await screen.findByRole("img", { name: /QPay QR code/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Waiting for your payment" })).toBeInTheDocument(); // "баталгаажуулж байна" биш
    expect(screen.getByText(/Invoice valid for/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel this order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check payment/i })).toBeInTheDocument();
  });

  it("shows no payment panel once the order is paid", async () => {
    stubApi({ "GET /api/v1/orders/LK-ABCD2345": { body: makeOrder() } });
    renderWithQuery(<ConfirmationView number="LK-ABCD2345" />);

    await screen.findByRole("heading", { name: "Thank you for your order" });
    expect(screen.queryByRole("button", { name: /check payment/i })).not.toBeInTheDocument();
  });
});
