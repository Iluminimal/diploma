import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderProgress, orderSteps } from "./order-progress";

const base = { created_at: "2026-10-01T10:00:00Z" };
const paid = { ...base, paid_at: "2026-10-01T10:05:00Z" };
const shipped = { ...paid, shipped_at: "2026-10-02T09:00:00Z" };
const delivered = { ...shipped, delivered_at: "2026-10-04T15:00:00Z" };

const labels = (order: Parameters<typeof orderSteps>[0]) => orderSteps(order).map((step) => `${step.label}:${step.done}`);

describe("orderSteps", () => {
  it("lists the four steps and which have happened", () => {
    expect(labels({ status: "pending", ...base })).toEqual(["Placed:true", "Paid:false", "Shipped:false", "Delivered:false"]);
    expect(labels({ status: "paid", ...paid })).toEqual(["Placed:true", "Paid:true", "Shipped:false", "Delivered:false"]);
    expect(labels({ status: "delivered", ...delivered })).toEqual(["Placed:true", "Paid:true", "Shipped:true", "Delivered:true"]);
  });

  it("ends a cancelled order at its cancellation", () => {
    expect(labels({ status: "cancelled", ...base, cancelled_at: "2026-10-01T11:00:00Z" })).toEqual(["Placed:true", "Cancelled:true"]);
  });

  it("keeps what a refunded order went through, then the refund", () => {
    expect(labels({ status: "refunded", ...shipped, refunded_at: "2026-10-05T09:00:00Z" })).toEqual([
      "Placed:true",
      "Paid:true",
      "Shipped:true",
      "Refunded:true",
    ]);
  });
});

describe("OrderProgress", () => {
  it("fills a connector for every step that has happened, one after the other", () => {
    const { container } = render(<OrderProgress order={{ status: "shipped", ...shipped }} />);

    const fills = [...container.querySelectorAll<HTMLElement>(".animate-grow")];
    expect(fills).toHaveLength(2); // үүсгэсэн -> төлсөн -> илгээсэн
    expect(fills.map((fill) => fill.style.animationDelay)).toEqual(["0ms", "160ms"]);
  });

  it("marks the step the order is on and says so to a screen reader", () => {
    render(<OrderProgress order={{ status: "shipped", ...shipped }} />);

    const steps = within(screen.getByRole("list", { name: "Order progress" })).getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
    expect(steps[2]).toHaveTextContent("Shipped, current step");
    expect(steps[0]).toHaveTextContent("Placed, done");
    expect(steps[1]).not.toHaveAttribute("aria-current");
    expect(steps[3]).toHaveTextContent("Delivered, not yet");
    expect(steps[2]).toHaveTextContent("Oct 2");
  });

  it("shows a delivered order as complete, with the last step done", () => {
    render(<OrderProgress order={{ status: "delivered", ...delivered }} />);

    const steps = screen.getAllByRole("listitem");
    expect(steps[3]).toHaveTextContent("Delivered, done");
    expect(steps[3]).toHaveAttribute("aria-current", "step");
    expect(steps[3]?.querySelector("svg")).not.toBeNull();
  });

  it("shows a cancelled order as stopped", () => {
    render(<OrderProgress order={{ status: "cancelled", ...base }} />);

    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).toHaveTextContent("Cancelled");
  });
});
