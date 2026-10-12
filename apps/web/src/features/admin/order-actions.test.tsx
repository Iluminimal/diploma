import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/features/auth/auth-store";
import { respond, problem, stubApi } from "@/test/api-mock";
import { makeAdminOrder } from "@/test/fixtures";
import { renderWithQuery } from "@/test/render";
import { availableActions, OrderActions } from "./order-actions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/admin/orders/LK-ABCD2345" }));

const NUMBER = "LK-ABCD2345";
const route = (action: string) => `POST /api/v1/admin/orders/${NUMBER}/${action}`;

beforeEach(() => {
  useAuth.setState({
    status: "signedIn",
    accessToken: "t",
    user: { id: 1, email: "a@b.co", full_name: "Admin", role: "admin", avatar_url: null, has_password: true, phone: null, email_verified: false, phone_verified: false, providers: [] as string[] },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("availableActions", () => {
  it.each([
    ["pending", { ship: false, deliver: false, cancel: true, refund: false }],
    ["paid", { ship: true, deliver: false, cancel: false, refund: true }],
    ["shipped", { ship: false, deliver: true, cancel: false, refund: true }],
    ["delivered", { ship: false, deliver: false, cancel: false, refund: true }],
    ["cancelled", { ship: false, deliver: false, cancel: false, refund: false }],
    ["refunded", { ship: false, deliver: false, cancel: false, refund: false }],
  ] as const)("for a %s order", (status, expected) => {
    expect(availableActions(status)).toEqual(expected);
  });
});

describe("OrderActions", () => {
  it("offers nothing for an order that is finished", () => {
    stubApi({});
    renderWithQuery(<OrderActions order={makeAdminOrder({ status: "refunded" })} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers shipping and refunding for a paid order", () => {
    stubApi({});
    renderWithQuery(<OrderActions order={makeAdminOrder({ status: "paid" })} />);

    expect(screen.getByRole("button", { name: "Mark as shipped" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refund" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
  });

  describe("shipping", () => {
    it("asks for a carrier and a tracking number before calling the API", async () => {
      const api = stubApi({});
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "paid" })} />);

      await userEvent.click(screen.getByRole("button", { name: "Mark as shipped" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Mark as shipped" }));

      expect(await within(dialog).findByText("Enter the carrier")).toBeInTheDocument();
      expect(within(dialog).getByText("Enter the tracking number")).toBeInTheDocument();
      expect(api.calls).toHaveLength(0);
    });

    it("sends the shipment and closes", async () => {
      const api = stubApi({
        [route("ship")]: respond(makeAdminOrder({ status: "shipped" })),
        "GET /api/v1/admin/orders": respond({ items: [], total: 0, page: 1, page_size: 25, pages: 0, status_counts: {} }),
      });
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "paid" })} />);

      await userEvent.click(screen.getByRole("button", { name: "Mark as shipped" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Carrier"), "DHL");
      await userEvent.type(within(dialog).getByLabelText("Tracking number"), "  JD0146 0000 1234 ");
      await userEvent.click(within(dialog).getByRole("button", { name: "Mark as shipped" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      const call = api.calls.find((c) => c.method === "POST");
      expect(call?.path).toBe(`/api/v1/admin/orders/${NUMBER}/ship`);
      expect(call?.body).toEqual({ carrier: "DHL", tracking_number: "JD0146 0000 1234" });
    });

    it("stays open when the order has moved on in the meantime", async () => {
      stubApi({
        [route("ship")]: problem(409, "Cannot ship this order", { detail: "A shipped order cannot be shipped." }),
      });
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "paid" })} />);

      await userEvent.click(screen.getByRole("button", { name: "Mark as shipped" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Carrier"), "UPS");
      await userEvent.type(within(dialog).getByLabelText("Tracking number"), "1Z999");
      await userEvent.click(within(dialog).getByRole("button", { name: "Mark as shipped" }));

      await waitFor(() => expect(within(dialog).getByRole("button", { name: "Mark as shipped" })).toBeEnabled());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("delivering", () => {
    it("confirms, then marks the order delivered", async () => {
      const api = stubApi({ [route("deliver")]: respond(makeAdminOrder({ status: "delivered" })) });
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "shipped" })} />);

      await userEvent.click(screen.getByRole("button", { name: "Mark as delivered" }));
      const dialog = await screen.findByRole("dialog");
      expect(api.calls).toHaveLength(0);
      await userEvent.click(within(dialog).getByRole("button", { name: "Mark as delivered" }));

      await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/deliver"))).toBe(true));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });

  describe("cancelling", () => {
    it("cancels an unpaid order with a note", async () => {
      const api = stubApi({ [route("cancel")]: respond(makeAdminOrder({ status: "cancelled" })) });
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "pending", payment: null })} />);

      await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "  Customer called ");
      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel order" }));

      await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/cancel"))).toBe(true));
      expect(api.calls.find((c) => c.path.endsWith("/cancel"))?.body).toEqual({ reason: "Customer called" });
    });

    it("needs no note", async () => {
      const api = stubApi({ [route("cancel")]: respond(makeAdminOrder({ status: "cancelled" })) });
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "pending", payment: null })} />);

      await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
      await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel order" }));

      await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/cancel"))).toBe(true));
      expect(api.calls.find((c) => c.path.endsWith("/cancel"))?.body).toBeUndefined();
    });
  });

  describe("refunding", () => {
    it("shows what will be refunded and needs a reason", async () => {
      const api = stubApi({});
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "delivered" })} />);

      await userEvent.click(screen.getByRole("button", { name: "Refund" }));
      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("$74.97");
      await userEvent.click(within(dialog).getByRole("button", { name: "Refund order" }));

      expect(await within(dialog).findByText("Say why it is being refunded")).toBeInTheDocument();
      expect(api.calls).toHaveLength(0);
    });

    it("puts goods that never left back in stock by default, and shipped ones not", async () => {
      stubApi({});
      const paid = renderWithQuery(<OrderActions order={makeAdminOrder({ status: "paid" })} />);
      await userEvent.click(screen.getByRole("button", { name: "Refund" }));
      expect(await screen.findByRole("checkbox", { name: "Put the items back in stock" })).toBeChecked();
      paid.unmount();

      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "shipped" })} />);
      await userEvent.click(screen.getByRole("button", { name: "Refund" }));
      expect(await screen.findByRole("checkbox", { name: "Put the items back in stock" })).not.toBeChecked();
    });

    it("sends the reason and the stock decision", async () => {
      const api = stubApi({ [route("refund")]: respond(makeAdminOrder({ status: "refunded" })) });
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "delivered" })} />);

      await userEvent.click(screen.getByRole("button", { name: "Refund" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Reason"), "Arrived damaged");
      await userEvent.click(within(dialog).getByRole("checkbox", { name: "Put the items back in stock" }));
      await userEvent.click(within(dialog).getByRole("button", { name: "Refund order" }));

      await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/refund"))).toBe(true));
      expect(api.calls.find((c) => c.path.endsWith("/refund"))?.body).toEqual({ reason: "Arrived damaged", restock: true });
    });

    it("stays open when the payment provider is down", async () => {
      stubApi({ [route("refund")]: problem(502, "Payment provider error") });
      renderWithQuery(<OrderActions order={makeAdminOrder({ status: "paid" })} />);

      await userEvent.click(screen.getByRole("button", { name: "Refund" }));
      const dialog = await screen.findByRole("dialog");
      await userEvent.type(within(dialog).getByLabelText("Reason"), "Changed mind");
      await userEvent.click(within(dialog).getByRole("button", { name: "Refund order" }));

      await waitFor(() => expect(within(dialog).getByRole("button", { name: "Refund order" })).toBeEnabled());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});
