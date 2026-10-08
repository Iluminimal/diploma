import type { Cart, CartLine } from "./cart-api";

/** Rebuild the totals after changing the lines locally (optimistic updates). */
export function withLines(cart: Cart, lines: CartLine[]): Cart {
  return {
    ...cart,
    lines,
    item_count: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotal_cents: lines.reduce((sum, line) => sum + line.line_total_cents, 0),
    has_issues: lines.some((line) => line.issue),
  };
}

export function withQuantity(cart: Cart, itemId: number, quantity: number): Cart {
  return withLines(
    cart,
    cart.lines.map((line) =>
      line.id === itemId
        ? { ...line, quantity, line_total_cents: line.unit_price_cents * quantity, issue: quantity > line.max_quantity ? line.issue : null }
        : line,
    ),
  );
}

export function withoutLine(cart: Cart, itemId: number): Cart {
  return withLines(
    cart,
    cart.lines.filter((line) => line.id !== itemId),
  );
}
