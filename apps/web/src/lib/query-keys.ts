/** One place for TanStack Query keys, so mutations can invalidate what they changed. */
export const queryKeys = {
  cart: ["cart"] as const,
  wishlist: ["wishlist"] as const,
  addresses: ["addresses"] as const,
  orders: ["orders"] as const,
  order: (number: string) => ["order", number] as const,
  shippingMethods: ["shipping-methods"] as const,
  admin: {
    all: ["admin"] as const,
    products: ["admin", "products"] as const,
    product: (id: number) => ["admin", "product", id] as const,
    categories: ["admin", "categories"] as const,
    orders: ["admin", "orders"] as const,
    order: (number: string) => ["admin", "order", number] as const,
  },
};

/** Everything tied to the signed-in account (not the public catalogue). */
export const accountKeys = [
  queryKeys.cart,
  queryKeys.wishlist,
  queryKeys.addresses,
  queryKeys.orders,
  ["order"],
  queryKeys.admin.all,
] as const;
