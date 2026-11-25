import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, problem, respond, stubApi } from "@/test/api-mock";
import { makeOrder } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { QPayPanel } from "./qpay-panel";

const charge = { currency: "MNT", amount_minor: 10_500_000 };
const qpay = {
  qr_image: "iVBORw0KGgo=",
  qr_text: "0002010102",
  short_url: "https://s.qpay.mn/abc",
  banks: [{ name: "Khan bank", description: "Хаан банк", logo: "", link: "khanbank://q" }],
};
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const ORDER = "GET /api/v1/orders/LK-ABCD2345";
const CHECK = "POST /api/v1/checkout/orders/LK-ABCD2345/check-payment";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "visibilityState");
});

/** Нүүр хуудас захиалгын төлвийг асууна: өөр route тодорхойлоогүй тестэд "төлбөр хүлээж буй" гэж хариулна. */
const stubPending = (routes: Parameters<typeof stubApi>[0] = {}) =>
  stubApi({ [ORDER]: respond(makeOrder({ status: "pending" })), ...routes });

/** Хуурамч цаг ба жинхэнэ цаг хамт явна: userEvent, waitFor ажиллана, `advance` секундээр урагшлуулна. */
async function advance(ms: number) {
  await act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
}

function panel(expiresAt: string | null, handlers: { onPaid?: () => void; onCancelled?: () => void } = {}) {
  return renderWithQuery(
    <QPayPanel
      number="LK-ABCD2345"
      charge={charge}
      qpay={qpay}
      expiresAt={expiresAt}
      onPaid={handlers.onPaid ?? vi.fn()}
      onCancelled={handlers.onCancelled ?? vi.fn()}
    />,
  );
}

describe("QPayPanel", () => {
  it("shows the amount, the QR and how long the invoice stays valid", () => {
    stubPending();
    panel(inMinutes(30));

    expect(screen.getByText("₮105,000")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QPay QR code for order LK-ABCD2345/ })).toBeInTheDocument();
    expect(screen.getByText(/Invoice valid for (29|30):\d\d/)).toBeInTheDocument();
  });

  it("hides the QR once the invoice has expired and offers to check out again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    stubPending();
    panel(new Date(Date.now() + 2000).toISOString());
    expect(screen.getByRole("img")).toBeInTheDocument();

    await act(async () => void vi.advanceTimersByTime(3000));

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("This invoice has expired")).toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "Check out again" })).toHaveAttribute("href", "/checkout");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("cancels the order after a confirmation and tells the page", async () => {
    const onCancelled = vi.fn();
    const api = stubPending({
      "POST /api/v1/orders/LK-ABCD2345/cancel": () => json(makeOrder({ status: "cancelled" })),
    });
    panel(inMinutes(30), { onCancelled });

    await userEvent.click(screen.getByRole("button", { name: "Cancel this order" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this order?" });
    expect(api.count("POST /api/v1/orders/LK-ABCD2345/cancel")).toBe(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));

    await waitFor(() => expect(onCancelled).toHaveBeenCalledTimes(1));
    expect(api.count("POST /api/v1/orders/LK-ABCD2345/cancel")).toBe(1);
  });

  it("keeps waiting when the shopper changes their mind", async () => {
    const onCancelled = vi.fn();
    const api = stubPending();
    panel(inMinutes(30), { onCancelled });

    await userEvent.click(screen.getByRole("button", { name: "Cancel this order" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep waiting" }));

    expect(api.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it("explains why the order could not be cancelled and leaves it open", async () => {
    const onCancelled = vi.fn();
    stubPending({
      "POST /api/v1/orders/LK-ABCD2345/cancel": problem(409, "Order just paid", { type: "urn:angel:problem:invalid-order-transition" }),
    });
    panel(inMinutes(30), { onCancelled });

    await userEvent.click(screen.getByRole("button", { name: "Cancel this order" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel order" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onCancelled).not.toHaveBeenCalled();
  });
  describe("waiting for the payment", () => {
    it("moves on by itself once the server reports the order as paid, without asking QPay", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let reads = 0;
      const api = stubApi({ [ORDER]: () => json(makeOrder({ status: ++reads < 3 ? "pending" : "paid" })) });
      const onPaid = vi.fn();
      panel(inMinutes(30), { onPaid });

      await advance(0);
      expect(api.count(ORDER)).toBe(1);
      expect(onPaid).not.toHaveBeenCalled();

      await advance(3_000);
      expect(onPaid).not.toHaveBeenCalled();
      await advance(3_000);

      await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
      expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ number: "LK-ABCD2345", status: "paid" }));
      expect(api.count(CHECK)).toBe(0);
    });

    it("asks our own API about every 3 seconds while the order is pending", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const api = stubPending();
      const onPaid = vi.fn();
      panel(inMinutes(30), { onPaid });

      await advance(0);
      expect(api.count(ORDER)).toBe(1);
      await advance(9_000);

      expect(api.count(ORDER)).toBeGreaterThanOrEqual(4);
      expect(api.count(ORDER)).toBeLessThanOrEqual(5);
      expect(api.count(CHECK)).toBe(0);
      expect(onPaid).not.toHaveBeenCalled();
    });

    it("pauses while the tab is hidden and resumes when it is visible again", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      const api = stubPending();
      panel(inMinutes(30));

      await advance(0);
      const afterMount = api.count(ORDER);
      await advance(12_000);
      expect(api.count(ORDER)).toBe(afterMount);

      Reflect.deleteProperty(document, "visibilityState");
      await advance(6_000);
      expect(api.count(ORDER)).toBeGreaterThan(afterMount);
    });

    it("calls onPaid only once when the check button also sees the payment", async () => {
      const api = stubApi({
        [ORDER]: respond(makeOrder({ status: "paid" })),
        [CHECK]: respond(makeOrder({ status: "paid" })),
      });
      const onPaid = vi.fn();
      panel(inMinutes(30), { onPaid });
      await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));

      await userEvent.click(screen.getByRole("button", { name: /check payment/i }));

      await waitFor(() => expect(api.count(CHECK)).toBe(1));
      expect(onPaid).toHaveBeenCalledTimes(1);
    });

    it("still lets the shopper confirm with the button when the status poll has not seen the payment yet", async () => {
      const api = stubPending({ [CHECK]: respond(makeOrder({ status: "paid" })) });
      const onPaid = vi.fn();
      panel(inMinutes(30), { onPaid });
      await waitFor(() => expect(api.count(ORDER)).toBe(1));

      await userEvent.click(screen.getByRole("button", { name: /check payment/i }));

      await waitFor(() => expect(onPaid).toHaveBeenCalledTimes(1));
    });

    it("closes the QR and stops asking once the order was cancelled elsewhere", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const api = stubApi({ [ORDER]: respond(makeOrder({ status: "cancelled" })) });
      const onPaid = vi.fn();
      panel(inMinutes(30), { onPaid });

      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText(/This order is no longer open/)).toBeInTheDocument();
      expect(within(alert).getByRole("link", { name: "Check out again" })).toHaveAttribute("href", "/checkout");
      expect(screen.queryByRole("img")).not.toBeInTheDocument();

      const reads = api.count(ORDER);
      await advance(12_000);
      expect(api.count(ORDER)).toBe(reads);
      expect(onPaid).not.toHaveBeenCalled();
    });

    it("keeps the QR and waits quietly when the status cannot be read", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const api = stubApi({ [ORDER]: () => problem(503, "Service unavailable") });
      const onPaid = vi.fn();
      panel(inMinutes(30), { onPaid });

      await advance(0);
      expect(api.count(ORDER)).toBe(1);
      expect(screen.getByRole("img", { name: /QPay QR code/ })).toBeInTheDocument();
      expect(screen.queryByText(/Service unavailable/)).not.toBeInTheDocument();

      await advance(9_000); // алдааны дараа удаан асууна (15 сек), тиймээс одоохондоо дахин асуугаагүй
      expect(api.count(ORDER)).toBe(1);
      await advance(7_000);
      expect(api.count(ORDER)).toBe(2);
      expect(onPaid).not.toHaveBeenCalled();
    });
  });
});
