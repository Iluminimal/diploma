/** One place for TanStack Query keys, so mutations can invalidate what they changed. */
export const queryKeys = {
  cart: ["cart"] as const,
  wishlist: ["wishlist"] as const,
  addresses: ["addresses"] as const,
  orders: ["orders"] as const,
  order: (number: string) => ["order", number] as const,
  shippingMethods: ["shipping-methods"] as const,
};

/** Everything tied to the signed-in account (not the public catalogue). */
export const accountKeys = [
  queryKeys.cart,
  queryKeys.wishlist,
  queryKeys.addresses,
  queryKeys.orders,
  ["order"],
] as const;
