/**
 * TanStack Query түлхүүрүүдийн нэг газар, ингэснээр mutation өөрийн өөрчилсөн зүйлийг invalidate
 * хийж чадна.
 */
export const queryKeys = {
  cart: ["cart"] as const,
  wishlist: ["wishlist"] as const,
  addresses: ["addresses"] as const,
  orders: ["orders"] as const,
  sessions: ["sessions"] as const,
  order: (number: string) => ["order", number] as const,
  shippingMethods: ["shipping-methods"] as const,
  reviews: (productId: number) => ["reviews", productId] as const,
  admin: {
    all: ["admin"] as const,
    products: ["admin", "products"] as const,
    product: (id: number) => ["admin", "product", id] as const,
    categories: ["admin", "categories"] as const,
    orders: ["admin", "orders"] as const,
    order: (number: string) => ["admin", "order", number] as const,
    stats: (days: number) => ["admin", "stats", days] as const,
    customers: ["admin", "customers"] as const,
    customer: (id: number) => ["admin", "customer", id] as const,
    reviews: ["admin", "reviews"] as const,
  },
};

/** Нэвтэрсэн account-тай холбоотой бүх зүйл (нийтийн каталог биш). */
export const accountKeys = [
  queryKeys.cart,
  queryKeys.wishlist,
  queryKeys.addresses,
  queryKeys.orders,
  queryKeys.sessions,
  ["order"],
  queryKeys.admin.all,
] as const;
