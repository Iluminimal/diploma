import { describe, expect, it } from "vitest";
import { makeCart, makeCartLine, makeProduct } from "@/test/fixtures";
import { withoutLine, withQuantity } from "./cart-math";

const cart = makeCart([
  makeCartLine({ id: 1, quantity: 2, product: makeProduct({ id: 1, price_cents: 1000 }) }),
  makeCartLine({ id: 2, quantity: 1, product: makeProduct({ id: 2, price_cents: 2500 }) }),
]);

describe("cart math", () => {
  it("recomputes line and cart totals when a quantity changes", () => {
    const updated = withQuantity(cart, 1, 5);

    expect(updated.lines[0]).toMatchObject({ quantity: 5, line_total_cents: 5000 });
    expect(updated.item_count).toBe(6);
    expect(updated.subtotal_cents).toBe(5000 + 2500);
    expect(cart.item_count).toBe(3); // анхных нь өөрчлөгдөөгүй
  });

  it("drops a line and its share of the totals", () => {
    const updated = withoutLine(cart, 2);

    expect(updated.lines.map((l) => l.id)).toEqual([1]);
    expect(updated).toMatchObject({ item_count: 2, subtotal_cents: 2000, has_issues: false });
  });

  it("clears a low-stock warning once the quantity fits", () => {
    const warned = makeCart([makeCartLine({ quantity: 5, max_quantity: 3, issue: "low_stock" })]);

    const fixed = withQuantity(warned, 1, 3);

    expect(fixed.lines[0]?.issue).toBeNull();
    expect(fixed.has_issues).toBe(false);
  });
});
