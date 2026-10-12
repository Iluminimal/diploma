import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { describeEvent, OrderTimeline } from "./order-events";

const at = "2026-10-08T10:00:00Z";

describe("describeEvent", () => {
  it("describes a shipment with its carrier and tracking number", () => {
    expect(describeEvent({ type: "shipped", at, data: { carrier: "DHL", tracking_number: "JD01", actor: "admin@example.com" } }, "USD")).toEqual({
      title: "Shipped",
      lines: ["With DHL", "Tracking number JD01"],
      actor: "admin@example.com",
    });
  });

  it("says how much was paid and refunded", () => {
    expect(describeEvent({ type: "paid", at, data: { amount_cents: 7497 } }, "USD").lines).toEqual(["$74.97"]);
    expect(
      describeEvent({ type: "refunded", at, data: { amount_cents: 7497, reason: "Did not fit", restock: true } }, "USD").lines,
    ).toEqual(["$74.97", "Did not fit", "Items returned to stock"]);
    expect(describeEvent({ type: "refunded", at, data: { restock: false } }, "USD").lines).toEqual(["Items not returned to stock"]);
  });

  it("puts a known reason into words and shows an unknown one as it is", () => {
    expect(describeEvent({ type: "cancelled", at, data: { reason: "expired" } }, "USD").lines).toEqual(["Not paid in time"]);
    expect(describeEvent({ type: "cancelled", at, data: { reason: "something new" } }, "USD").lines).toEqual(["something new"]);
  });

  it("calls an automatic refund automatic", () => {
    const refund = describeEvent({ type: "refunded", at, data: { reason: "order_cancelled", automatic: true } }, "USD");

    expect(refund.title).toBe("Refunded automatically");
    expect(refund.lines).toEqual(["The payment arrived after the order was cancelled"]);
  });

  it("copes with the little the customer is given", () => {
    expect(describeEvent({ type: "refunded", at, data: {} }, "USD")).toEqual({ title: "Refunded", lines: [], actor: undefined });
    expect(describeEvent({ type: "mystery", at, data: {} }, "USD").title).toBe("mystery");
  });
});

describe("OrderTimeline", () => {
  const events = [
    { type: "placed", at: "2026-10-08T10:00:00Z", data: {} },
    { type: "paid", at: "2026-10-08T10:05:00Z", data: { amount_cents: 7497 } },
    { type: "note", at: "2026-10-08T12:00:00Z", data: { text: "Gift box please", actor: "admin@example.com" } },
  ];

  it("lists events oldest first by default", () => {
    render(<OrderTimeline events={events} currency="USD" />);

    const items = within(screen.getByRole("list", { name: "Order history" })).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual(["Order placed", "Payment received", "Note"]);
  });

  it("can show the newest first, with who did it", () => {
    render(<OrderTimeline events={events} currency="USD" newestFirst />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Gift box please");
    expect(items[0]).toHaveTextContent("admin@example.com");
    expect(items[2]).toHaveTextContent("Order placed");
  });
});
