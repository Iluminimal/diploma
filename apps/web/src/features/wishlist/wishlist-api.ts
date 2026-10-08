import { browserApi, call } from "@/lib/api/browser";
import type { components } from "@/lib/api/client";

export type Wishlist = components["schemas"]["WishlistOut"];

export const fetchWishlist = () => call(browserApi().GET("/api/v1/wishlist"));

export const saveProduct = (productId: number) =>
  call(browserApi().PUT("/api/v1/wishlist/{product_id}", { params: { path: { product_id: productId } } }));

export const unsaveProduct = (productId: number) =>
  call(browserApi().DELETE("/api/v1/wishlist/{product_id}", { params: { path: { product_id: productId } } }));
